// SPDX-License-Identifier: MIT
// Two real libp2p nodes over the in-memory transport (Noise, Yamux,
// identify): discovery, manifest, commands with scopes, both pairing modes,
// revocation. All data made up.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createLibp2p } from 'libp2p';
import { memory } from '@libp2p/memory';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify, identifyPush } from '@libp2p/identify';

import { UcepError, createConsumer, createProvider, parseInvitation } from '../src/index.js';

/** @param {string} name */
async function node(name) {
	return createLibp2p({
		addresses: { listen: [`/memory/${name}-${Math.random().toString(36).slice(2)}`] },
		transports: [memory()],
		connectionEncrypters: [noise()],
		streamMuxers: [yamux()],
		services: { identify: identify(), identifyPush: identifyPush() }
	});
}

const MANIFEST = {
	id: 'invoice',
	name: 'Rechnungen (Test)',
	version: '0.1.0',
	description: 'Made-up invoicing app for tests',
	scopes: [
		{ name: 'invoice:eigenbeleg:create', description: 'Eigenbelege erstellen' },
		{ name: 'invoice:document:read', description: 'Dokumente lesen' }
	]
};

/** @param {() => boolean | Promise<boolean>} cond */
async function until(cond, ms = 5000) {
	const end = Date.now() + ms;
	while (!(await cond())) {
		if (Date.now() > end) throw new Error('timed out');
		await new Promise((r) => setTimeout(r, 20));
	}
}

describe('UCEP over libp2p', () => {
	/** @type {import('@libp2p/interface').Libp2p} */ let providerNode;
	/** @type {import('@libp2p/interface').Libp2p} */ let consumerNode;
	/** @type {import('@libp2p/interface').Libp2p} */ let strangerNode;
	/** @type {ReturnType<typeof createProvider>} */ let provider;
	/** @type {ReturnType<typeof createConsumer>} */ let consumer;
	/** @type {ReturnType<typeof createConsumer>} */ let stranger;
	let created = 0;

	before(async () => {
		providerNode = await node('provider');
		consumerNode = await node('consumer');
		strangerNode = await node('stranger');
		provider = createProvider({
			libp2p: providerNode,
			manifest: MANIFEST,
			commands: {
				help: { handler: () => ({ commands: ['help', 'create-eigenbeleg', 'status'] }) },
				'create-eigenbeleg': {
					scope: 'invoice:eigenbeleg:create',
					idempotent: true,
					validate: (a) => typeof a?.reason === 'string',
					handler: ({ argsJson, grant }) => ({
						number: `EB-2026-${String(++created).padStart(3, '0')}`,
						for: grant?.label,
						reason: argsJson?.reason
					})
				},
				status: { scope: 'invoice:document:read', handler: () => ({ state: 'created' }) },
				big: { handler: () => ({ blob: 'x'.repeat(2 * 1024 * 1024) }) }
			}
		});
		await provider.start();
		consumer = createConsumer({ libp2p: consumerNode, label: 'Belege (Test)' });
		stranger = createConsumer({ libp2p: strangerNode, label: 'Fremd' });
		await consumer.start();
		await stranger.start();
	});

	after(async () => {
		await Promise.all([providerNode.stop(), consumerNode.stop(), strangerNode.stop()]);
	});

	const providerId = () => providerNode.peerId.toString();

	test('finds the extension through identify, with its manifest; public commands work', async () => {
		const added = await consumer.addProvider(providerNode.getMultiaddrs()[0].toString());
		assert.equal(added.reachable, true);
		assert.deepEqual(
			added.extensions.map((e) => e.protocol),
			['/uc/extension/invoice/0.1.0']
		);
		await until(async () => (await consumer.catalogue())[0]?.manifest != null);
		const [entry] = await consumer.catalogue();
		assert.equal(entry.status, 'online');
		assert.equal(entry.manifest.ucepVersion, 2);
		assert.deepEqual(entry.manifest.pairingModes, ['INVITATION', 'IN_BAND']);
		assert.equal(
			entry.manifest.commands.find((/** @type {any} */ c) => c.name === 'create-eigenbeleg').scope,
			'invoice:eigenbeleg:create'
		);
		assert.deepEqual((await consumer.call(providerId(), 'invoice', 'help')).commands.length, 3);
	});

	test('a scoped command needs pairing; errors carry their code', async () => {
		await assert.rejects(
			consumer.call(providerId(), 'invoice', 'create-eigenbeleg', { reason: 'Test' }),
			(e) => e instanceof UcepError && e.code === 'PAIRING_REQUIRED'
		);
		await assert.rejects(
			consumer.call(providerId(), 'invoice', 'nope'),
			(e) => e instanceof UcepError && e.code === 'UNKNOWN_COMMAND'
		);
		await assert.rejects(
			consumer.call(providerId(), 'invoice', 'big'),
			(e) => e instanceof UcepError && e.code === 'TOO_LARGE'
		);
	});

	test('invitation: pairs with the offered scope, a second use and a stranger are refused', async () => {
		const { uri } = await provider.createInvitation({ scopes: ['invoice:eigenbeleg:create'] });
		assert.equal(parseInvitation(uri).providerPeerId, providerId());
		const g = await consumer.pairWithInvitation(uri);
		assert.deepEqual(g.scopes, ['invoice:eigenbeleg:create']);

		const first = await consumer.call(
			providerId(),
			'invoice',
			'create-eigenbeleg',
			{ reason: 'Test' },
			{ requestId: 'req-1' }
		);
		assert.deepEqual(first, { number: 'EB-2026-001', for: 'Belege (Test)', reason: 'Test' });
		// the same requestId: the first result, not a second document
		const again = await consumer.call(
			providerId(),
			'invoice',
			'create-eigenbeleg',
			{ reason: 'Test' },
			{ requestId: 'req-1' }
		);
		assert.deepEqual(again, first);
		await assert.rejects(
			consumer.call(providerId(), 'invoice', 'create-eigenbeleg', { nope: 1 }),
			(e) => e instanceof UcepError && e.code === 'INVALID_ARGUMENTS'
		);
		await assert.rejects(
			consumer.call(providerId(), 'invoice', 'status'),
			(e) => e instanceof UcepError && e.code === 'SCOPE_MISSING'
		);

		// the invitation is used up, also for someone who copied it
		await strangerNode.dial(providerNode.getMultiaddrs()[0]);
		await assert.rejects(
			stranger.pairWithInvitation(uri),
			(e) => e instanceof UcepError && e.code === 'INVITATION_USED'
		);
		await until(async () => (await stranger.catalogue()).length > 0);
		await assert.rejects(
			stranger.call(providerId(), 'invoice', 'create-eigenbeleg', { reason: 'x' }),
			(e) => e instanceof UcepError && e.code === 'PAIRING_REQUIRED'
		);
	});

	test('a proof made for another peer fails: the stranger cannot use a fresh invitation’s proof', async () => {
		const { uri } = await provider.createInvitation({ scopes: ['invoice:document:read'] });
		// scopes the invitation does not offer
		await assert.rejects(
			stranger.pairWithInvitation(uri, { scopes: ['invoice:eigenbeleg:create'] }),
			(e) => e instanceof UcepError && e.code === 'SCOPE_NOT_OFFERED'
		);
		// expired
		const late = createConsumer({ libp2p: strangerNode, now: () => Date.now() + 3_600_000 });
		await assert.rejects(
			late.pairWithInvitation(uri),
			(e) => e instanceof UcepError && e.code === 'INVITATION_EXPIRED'
		);
	});

	test('in-band: only in a pairing window, the same code on both sides, the human types it', async () => {
		await assert.rejects(
			stranger.pairInBand(providerId(), 'invoice', {
				scopes: ['invoice:document:read'],
				onCode: () => {}
			}),
			(e) => e instanceof UcepError && e.code === 'PAIRING_DISABLED'
		);
		provider.openPairingWindow(60_000);
		/** @type {string | null} */ let consumerCode = null;
		/** @type {any} */ let shown = null;
		provider.events.addEventListener(
			'pairing:pending',
			(e) => (shown = /** @type {CustomEvent} */ (e).detail),
			{
				once: true
			}
		);
		const pairing = stranger.pairInBand(providerId(), 'invoice', {
			scopes: ['invoice:document:read'],
			onCode: (sas) => (consumerCode = sas)
		});
		await until(() => shown !== null && consumerCode !== null);
		assert.equal(shown.sas, consumerCode);
		assert.equal(shown.label, 'Fremd');
		assert.equal(shown.peerId, strangerNode.peerId.toString());
		await assert.rejects(
			provider.approve(shown.id, { code: '000000' === consumerCode ? '111111' : '000000' })
		);
		await provider.approve(shown.id, { code: /** @type {string} */ (consumerCode) });
		const g = await pairing;
		assert.deepEqual(g.scopes, ['invoice:document:read']);
		assert.deepEqual(await stranger.call(providerId(), 'invoice', 'status'), { state: 'created' });
		// the window closes after the first grant
		await assert.rejects(
			consumer.pairInBand(providerId(), 'invoice', {
				scopes: ['invoice:document:read'],
				onCode: () => {}
			}),
			(e) => e instanceof UcepError && e.code === 'PAIRING_DISABLED'
		);
	});

	test('revoked by the provider, unpaired by the consumer', async () => {
		const [g] = (await provider.grants()).filter(
			(x) => x.consumerPeerId === strangerNode.peerId.toString()
		);
		await provider.revoke(g.grantId);
		await assert.rejects(
			stranger.call(providerId(), 'invoice', 'status'),
			(e) => e instanceof UcepError && e.code === 'PAIRING_REQUIRED'
		);
		assert.equal(await consumer.unpair(providerId(), 'invoice'), true);
		assert.equal((await provider.grants()).length, 0);
	});

	test('a DID bound to the pairing is checked and kept on the grant', async () => {
		const subtle = globalThis.crypto.subtle;
		const keys = /** @type {CryptoKeyPair} */ (
			await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
		);
		const pub = new Uint8Array(await subtle.exportKey('raw', keys.publicKey));
		const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
		let n = 0n;
		for (const b of [0xed, 0x01, ...pub]) n = (n << 8n) | BigInt(b);
		let enc = '';
		while (n > 0n) {
			enc = B58[Number(n % 58n)] + enc;
			n /= 58n;
		}
		const did = `did:key:z${enc}`;
		const withDid = createConsumer({
			libp2p: consumerNode,
			label: 'Belege (DID)',
			did,
			signDid: async (hash) => ({
				format: 'RAW',
				signature: new Uint8Array(await subtle.sign('Ed25519', keys.privateKey, hash))
			})
		});
		await withDid.start();
		const { uri } = await provider.createInvitation({ scopes: ['invoice:document:read'] });
		await withDid.pairWithInvitation(uri);
		const g = (await provider.grants()).find(
			(x) => x.consumerPeerId === consumerNode.peerId.toString()
		);
		assert.equal(g?.did, did);

		// A DID someone else claims, without its key: refused.
		const liar = createConsumer({
			libp2p: strangerNode,
			did,
			signDid: async () => ({ format: 'RAW', signature: new Uint8Array(64) })
		});
		const second = await provider.createInvitation({ scopes: ['invoice:document:read'] });
		await assert.rejects(
			liar.pairWithInvitation(second.uri),
			(e) => e instanceof UcepError && e.code === 'DID_SIGNATURE_INVALID'
		);
		await withDid.stop();
		await provider.revoke(/** @type {any} */ (g).grantId);
	});

	test('the catalogue sees a provider go offline, and an extension withdrawn', async () => {
		await provider.stop();
		await until(async () => (await consumer.catalogue())[0]?.status === 'withdrawn');
		await provider.start();
		await until(async () => (await consumer.catalogue())[0]?.status === 'online');
		await consumerNode.hangUp(providerNode.peerId);
		await until(async () => (await consumer.catalogue())[0]?.status === 'offline');
		assert.equal(await consumer.check(providerId(), '/uc/extension/invoice/0.1.0'), 'online');
	});
});
