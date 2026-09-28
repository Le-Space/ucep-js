// SPDX-License-Identifier: MIT
// What a security review of 0.2.0-draft.2 asked for: an invitation is used
// once even when two peers race for it, a revoked grant stays revoked while a
// command still runs, a retry of an idempotent command that is still running
// waits for its answer, approving needs the code, the idempotent results a
// peer can pile up are bounded, and an overlong did:key is refused before it
// is decoded. All data made up.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createLibp2p } from 'libp2p';
import { memory } from '@libp2p/memory';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify, identifyPush } from '@libp2p/identify';

import { UcepError, createConsumer, createProvider } from '../src/index.js';
import { parseDidKey } from '../src/did.js';

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
	scopes: [{ name: 'invoice:document:read', description: 'Dokumente lesen' }]
};

/** @param {() => boolean | Promise<boolean>} cond */
async function until(cond, ms = 5000) {
	const end = Date.now() + ms;
	while (!(await cond())) {
		if (Date.now() > end) throw new Error('timed out');
		await new Promise((r) => setTimeout(r, 20));
	}
}

describe('hardening', () => {
	/** @type {any[]} */ const nodes = [];
	/** @type {any} */ let providerNode;
	/** @type {ReturnType<typeof createProvider>} */ let provider;
	/** @type {ReturnType<typeof createConsumer>} */ let a;
	/** @type {ReturnType<typeof createConsumer>} */ let b;
	let runs = 0;
	/** @type {(() => void) | null} */ let release = null;

	before(async () => {
		providerNode = await node('provider');
		const aNode = await node('a');
		const bNode = await node('b');
		nodes.push(providerNode, aNode, bNode);
		provider = createProvider({
			libp2p: providerNode,
			manifest: MANIFEST,
			commands: {
				// Waits until the test releases it, when `hold` is set.
				slow: {
					scope: 'invoice:document:read',
					idempotent: true,
					handler: async ({ argsJson }) => {
						runs += 1;
						if (argsJson?.hold) await new Promise((r) => (release = () => r(undefined)));
						return { run: runs };
					}
				}
			}
		});
		await provider.start();
		a = createConsumer({ libp2p: aNode, label: 'A (Test)' });
		b = createConsumer({ libp2p: bNode, label: 'B (Test)' });
		await a.start();
		await b.start();
		await aNode.dial(providerNode.getMultiaddrs());
		await bNode.dial(providerNode.getMultiaddrs());
	});

	after(async () => {
		await Promise.all([provider.stop(), a.stop(), b.stop()]);
		await Promise.all(nodes.map((n) => n.stop()));
	});

	const providerId = () => providerNode.peerId.toString();

	test('two peers racing for one invitation: one grant, the other is told it is used', async () => {
		const { uri } = await provider.createInvitation({ scopes: ['invoice:document:read'] });
		const results = await Promise.allSettled([
			a.pairWithInvitation(uri),
			b.pairWithInvitation(uri)
		]);
		const granted = results.filter((r) => r.status === 'fulfilled');
		const refused = results.filter((r) => r.status === 'rejected');
		assert.equal(granted.length, 1);
		assert.equal(refused.length, 1);
		const reason = /** @type {PromiseRejectedResult} */ (refused[0]).reason;
		assert.ok(reason instanceof UcepError && reason.code === 'INVITATION_USED', String(reason));
		assert.equal((await provider.grants()).length, 1);
	});

	test('a grant revoked while its command runs stays revoked', async () => {
		const [g] = await provider.grants();
		const holder = g.consumerPeerId === nodes[1].peerId.toString() ? a : b;
		const running = holder.call(providerId(), 'invoice', 'slow', { hold: true });
		await until(() => release !== null);
		await provider.revoke(g.grantId);
		/** @type {() => void} */ (release)();
		release = null;
		await running; // it was allowed when it began
		assert.deepEqual(await provider.grants(), []);
		await assert.rejects(
			holder.call(providerId(), 'invoice', 'slow', {}),
			(e) => e instanceof UcepError && e.code === 'PAIRING_REQUIRED'
		);
	});

	test('a retry of an idempotent command that still runs gets its answer, not a second run', async () => {
		const { uri } = await provider.createInvitation({ scopes: ['invoice:document:read'] });
		await a.pairWithInvitation(uri);
		const before = runs;
		const first = a.call(providerId(), 'invoice', 'slow', { hold: true }, { requestId: 'r-1' });
		await until(() => release !== null);
		const retry = a.call(providerId(), 'invoice', 'slow', { hold: true }, { requestId: 'r-1' });
		await new Promise((r) => setTimeout(r, 100));
		/** @type {() => void} */ (release)();
		release = null;
		assert.deepEqual(await first, await retry);
		assert.equal(runs, before + 1);
	});

	test('idempotent results per peer are bounded: the oldest is run again', async () => {
		const before = runs;
		await a.call(providerId(), 'invoice', 'slow', {}, { requestId: 'oldest' });
		for (let i = 0; i < 256; i++)
			await a.call(providerId(), 'invoice', 'slow', {}, { requestId: `n-${i}` });
		assert.equal(runs, before + 257);
		await a.call(providerId(), 'invoice', 'slow', {}, { requestId: 'n-255' }); // kept
		assert.equal(runs, before + 257);
		await a.call(providerId(), 'invoice', 'slow', {}, { requestId: 'oldest' }); // dropped
		assert.equal(runs, before + 258);
	});

	test('approving needs the code the other app shows', async () => {
		provider.openPairingWindow(60_000);
		/** @type {any} */ let shown = null;
		provider.events.addEventListener(
			'pairing:pending',
			(e) => (shown = /** @type {CustomEvent} */ (e).detail),
			{
				once: true
			}
		);
		/** @type {string | null} */ let code = null;
		const pairing = b.pairInBand(providerId(), 'invoice', {
			scopes: ['invoice:document:read'],
			onCode: (sas) => (code = sas)
		});
		await until(() => shown !== null && code !== null);
		await assert.rejects(provider.approve(shown.id, /** @type {any} */ ({})), /code/);
		await assert.rejects(provider.approve(shown.id, /** @type {any} */ (undefined)), /code/);
		await provider.approve(shown.id, { code: /** @type {string} */ (code) });
		assert.deepEqual((await pairing).scopes, ['invoice:document:read']);
	});

	test('what the provider stores has no undefined field (a dag-cbor store refuses one)', async () => {
		/** @param {unknown} v @returns {boolean} */
		const hasUndefined = (v) =>
			v === undefined ||
			(v !== null && typeof v === 'object' && Object.values(v).some(hasUndefined));
		/** @type {Map<string, any>} */
		const kept = new Map();
		const strict = {
			get: async (/** @type {string} */ k) => kept.get(k),
			set: async (/** @type {string} */ k, /** @type {any} */ v) => {
				if (hasUndefined(v)) throw new Error(`undefined in ${k}`);
				kept.set(k, v);
			},
			delete: async (/** @type {string} */ k) => void kept.delete(k),
			values: async () => [...kept.values()]
		};
		const strictNode = await node('strict');
		nodes.push(strictNode);
		const confirming = createProvider({
			libp2p: strictNode,
			manifest: MANIFEST,
			commands: { help: { handler: () => ({}) } },
			confirmInvitations: true,
			store: { invitations: strict, grants: strict }
		});
		await confirming.start();
		/** @type {any} */ let shown = null;
		confirming.events.addEventListener(
			'pairing:pending',
			(e) => (shown = /** @type {CustomEvent} */ (e).detail),
			{
				once: true
			}
		);
		await nodes[1].dial(strictNode.getMultiaddrs());
		const { uri } = await confirming.createInvitation({ scopes: ['invoice:document:read'] });
		const pairing = a.pairWithInvitation(uri, { onCode: () => {} });
		await until(() => shown !== null);
		await confirming.approve(shown.id, { code: shown.sas });
		assert.deepEqual((await pairing).scopes, ['invoice:document:read']);
		await confirming.stop();
	});

	test('an overlong did:key is refused before it is decoded', () => {
		assert.throws(() => parseDidKey(`did:key:z${'1'.repeat(10_000)}`), /too long/);
	});
});
