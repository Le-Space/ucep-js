// SPDX-License-Identifier: MIT
// Limits per extension, stated in the manifest (ucep.md §11.1): a provider
// may accept larger requests and send larger answers; a consumer uses
// min(its own, the stated limit), the defaults where none is stated; a
// limited (relayed) connection stays at 64 KiB; a longer length prefix is
// refused before anything is buffered. All data made up.

import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createLibp2p } from 'libp2p';
import { memory } from '@libp2p/memory';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify, identifyPush } from '@libp2p/identify';
import { circuitRelayServer, circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { multiaddr } from '@multiformats/multiaddr';

import { LIMITS, createConsumer, createProvider, statedLimits } from '../src/index.js';

const MiB = 1024 * 1024;
/** A text of about 300 KiB: above the default request, below 1 MiB. */
const LONG = 'Wolkenfabrik Hosting GmbH, Position 1, 12,34 EUR\n'.repeat(6200);

/** An unsigned varint, as the length prefix of ucep.md §5. @param {number} n */
function uvarint(n) {
	const out = [];
	while (n >= 0x80) {
		out.push((n & 0x7f) | 0x80);
		n = Math.floor(n / 128);
	}
	out.push(n);
	return Uint8Array.from(out);
}

/** @type {any[]} */
const nodes = [];
after(async () => {
	await Promise.all(nodes.map((n) => n.stop()));
});

/** @param {string} name */
async function memoryNode(name) {
	const n = await createLibp2p({
		addresses: { listen: [`/memory/${name}-${Math.random().toString(36).slice(2)}`] },
		transports: [memory()],
		connectionEncrypters: [noise()],
		streamMuxers: [yamux()],
		services: { identify: identify(), identifyPush: identifyPush() }
	});
	nodes.push(n);
	return n;
}

/**
 * A provider of `belege-bridge` and what it has seen.
 *
 * @param {any} libp2p
 * @param {Partial<import('../src/protocol.js').MessageLimits>} [limits]
 */
async function bridge(libp2p, limits) {
	/** @type {number[]} */
	const received = [];
	const provider = createProvider({
		libp2p,
		manifest: { id: 'belege-bridge', name: 'Bridge (Test)', version: '0.1.0' },
		limits,
		commands: {
			read: {
				handler: ({ argsJson }) => {
					received.push(String(argsJson?.text ?? '').length);
					return { chars: String(argsJson?.text ?? '').length };
				}
			},
			answer: { handler: ({ argsJson }) => ({ text: 'x'.repeat(Number(argsJson?.bytes ?? 0)) }) }
		}
	});
	await provider.start();
	return { provider, received };
}

/**
 * A consumer that found the provider, and its manifest.
 *
 * @param {any} providerNode
 * @param {Partial<import('../src/protocol.js').MessageLimits>} [limits]
 */
async function consumerOf(providerNode, limits) {
	const consumerNode = await memoryNode('consumer');
	const consumer = createConsumer({ libp2p: consumerNode, label: 'Belege (Test)', limits });
	await consumer.start();
	const added = await consumer.addProvider(providerNode.getMultiaddrs()[0].toString());
	assert.equal(added.reachable, true);
	return { consumer, consumerNode, peer: providerNode.peerId.toString() };
}

/**
 * Open the extension's stream and send nothing but a length prefix: the
 * provider must refuse it before waiting for, or buffering, the message.
 *
 * @param {any} from
 * @param {any} to a PeerId or multiaddr
 * @param {number} length
 * @returns {Promise<'refused' | 'waiting'>}
 */
async function sendPrefix(from, to, length) {
	const stream = await from.dialProtocol(to, '/uc/extension/belege-bridge/0.1.0', {
		runOnLimitedConnection: true
	});
	stream.send(uvarint(length));
	const ended = new Promise((resolve) => {
		stream.addEventListener('close', () => resolve('refused'), { once: true });
	});
	const result = await Promise.race([
		ended,
		new Promise((resolve) => setTimeout(() => resolve('waiting'), 1500))
	]);
	stream.abort(new Error('test done'));
	return /** @type {any} */ (result);
}

describe('statedLimits', () => {
	test('absent, 0 and below the default mean the default', () => {
		const defaults = { request: LIMITS.request, response: LIMITS.response };
		assert.deepEqual(statedLimits(null), defaults);
		assert.deepEqual(statedLimits({}), defaults);
		assert.deepEqual(statedLimits({ limits: { request: 0, response: 0 } }), defaults);
		assert.deepEqual(statedLimits({ limits: { request: 1024 } }), defaults);
		assert.deepEqual(statedLimits({ limits: { request: MiB } }), {
			request: MiB,
			response: LIMITS.response
		});
	});

	test('a provider may not state less than the default', async () => {
		const n = await memoryNode('low');
		assert.throws(
			() =>
				createProvider({
					libp2p: n,
					manifest: { id: 'belege-bridge', name: 'B', version: '0.1.0' },
					commands: {},
					limits: { request: 1024 }
				}),
			/below the default/
		);
	});
});

describe('a provider that states 1 MiB', () => {
	test('its manifest says so; a consumer that allows 1 MiB sends a long request', async () => {
		const providerNode = await memoryNode('provider');
		const { received } = await bridge(providerNode, { request: MiB });
		const { consumer, peer } = await consumerOf(providerNode, { request: MiB });
		assert.deepEqual(await consumer.limitsFor(peer, 'belege-bridge'), {
			request: MiB,
			response: LIMITS.response
		});
		const [entry] = await consumer.catalogue();
		assert.equal(entry.manifest.limits.request, MiB);
		assert.equal(entry.manifest.limits.response, 0, 'the response limit is the default');
		const answer = await consumer.call(peer, 'belege-bridge', 'read', { text: LONG });
		assert.equal(answer.chars, LONG.length);
		assert.deepEqual(received, [LONG.length]);
	});

	test('a consumer with the defaults fails locally with TOO_LARGE, nothing is sent', async () => {
		const providerNode = await memoryNode('provider');
		const { received } = await bridge(providerNode, { request: MiB });
		const { consumer, peer } = await consumerOf(providerNode);
		await assert.rejects(consumer.call(peer, 'belege-bridge', 'read', { text: LONG }), {
			code: 'TOO_LARGE',
			limit: LIMITS.request,
			part: 'request'
		});
		assert.deepEqual(received, []);
	});

	test('a request over the stated limit fails locally too', async () => {
		const providerNode = await memoryNode('provider');
		const { received } = await bridge(providerNode, { request: 128 * 1024 });
		const { consumer, peer } = await consumerOf(providerNode, { request: MiB });
		await assert.rejects(consumer.call(peer, 'belege-bridge', 'read', { text: LONG }), {
			code: 'TOO_LARGE',
			limit: 128 * 1024
		});
		assert.deepEqual(received, []);
	});

	test('the consumer reads the manifest first when the catalogue has none yet', async () => {
		const providerNode = await memoryNode('provider');
		await bridge(providerNode, { request: MiB });
		const { consumer, peer } = await consumerOf(providerNode, { request: MiB });
		// What identify found, without the manifest it fetches in the background.
		for (const e of await consumer.catalogue()) e.manifest = null;
		const answer = await consumer.call(peer, 'belege-bridge', 'read', { text: LONG });
		assert.equal(answer.chars, LONG.length);
	});

	test('it refuses a length prefix above its limit before buffering, and waits below it', async () => {
		const providerNode = await memoryNode('provider');
		await bridge(providerNode, { request: MiB });
		const other = await memoryNode('other');
		const to = providerNode.getMultiaddrs()[0];
		assert.equal(await sendPrefix(other, to, MiB + 1), 'refused');
		assert.equal(await sendPrefix(other, to, 300 * 1024), 'waiting');
	});

	test('a larger response limit: read by a consumer that allows it, TOO_LARGE for one that does not', async () => {
		const providerNode = await memoryNode('provider');
		await bridge(providerNode, { response: 2 * MiB });
		const big = { bytes: 1.5 * MiB };
		const wide = await consumerOf(providerNode, { response: 2 * MiB });
		assert.equal(
			(await wide.consumer.call(wide.peer, 'belege-bridge', 'answer', big)).text.length,
			big.bytes
		);
		const narrow = await consumerOf(providerNode);
		await assert.rejects(narrow.consumer.call(narrow.peer, 'belege-bridge', 'answer', big), {
			code: 'TOO_LARGE',
			part: 'response'
		});
	});
});

describe('a provider that states nothing (an older one)', () => {
	test('no limits in its manifest; a consumer that allows 1 MiB keeps to 64 KiB', async () => {
		const providerNode = await memoryNode('provider');
		const { received } = await bridge(providerNode);
		const { consumer, peer } = await consumerOf(providerNode, { request: MiB });
		assert.deepEqual(await consumer.limitsFor(peer, 'belege-bridge'), {
			request: LIMITS.request,
			response: LIMITS.response
		});
		const [entry] = await consumer.catalogue();
		assert.equal(entry.manifest.limits, undefined);
		await assert.rejects(consumer.call(peer, 'belege-bridge', 'read', { text: LONG }), {
			code: 'TOO_LARGE',
			limit: LIMITS.request
		});
		assert.deepEqual(received, []);
		assert.equal((await consumer.call(peer, 'belege-bridge', 'read', { text: 'kurz' })).chars, 4);
		const other = await memoryNode('other');
		assert.equal(
			await sendPrefix(other, providerNode.getMultiaddrs()[0], LIMITS.request + 1),
			'refused'
		);
	});
});

describe('through a relay', () => {
	const base = () => ({
		connectionEncrypters: [noise()],
		streamMuxers: [yamux()],
		connectionGater: { denyDialMultiaddr: () => false }
	});

	/** @param {object} [reservations] */
	async function throughRelay(reservations) {
		const relay = await createLibp2p({
			...base(),
			addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
			transports: [webSockets()],
			services: {
				identify: identify(),
				relay: circuitRelayServer(reservations ? { reservations } : {})
			}
		});
		nodes.push(relay);
		const relayAddr = relay.getMultiaddrs()[0].toString();
		const providerNode = await createLibp2p({
			...base(),
			addresses: { listen: [`${relayAddr}/p2p-circuit`] },
			transports: [webSockets(), circuitRelayTransport()],
			services: { identify: identify(), identifyPush: identifyPush() }
		});
		nodes.push(providerNode);
		for (let i = 0; i < 100; i++) {
			if (providerNode.getMultiaddrs().some((a) => a.toString().includes('/p2p-circuit/'))) break;
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
		const { received } = await bridge(providerNode, { request: MiB });
		const consumerNode = await createLibp2p({
			...base(),
			transports: [webSockets(), circuitRelayTransport()],
			services: { identify: identify(), identifyPush: identifyPush() }
		});
		nodes.push(consumerNode);
		await consumerNode.dial(multiaddr(relayAddr));
		const consumer = createConsumer({
			libp2p: consumerNode,
			label: 'Belege',
			limits: { request: MiB }
		});
		await consumer.start();
		const addr = `${relayAddr}/p2p-circuit/p2p/${providerNode.peerId}`;
		const found = await consumer.addProvider(addr);
		assert.equal(found.reachable, true);
		return { consumer, consumerNode, providerNode, received, addr };
	}

	test('a limited connection keeps 64 KiB both ways, whatever the manifest says', async () => {
		const { consumer, consumerNode, providerNode, received } = await throughRelay();
		const peer = providerNode.peerId.toString();
		await assert.rejects(consumer.call(peer, 'belege-bridge', 'read', { text: LONG }), {
			code: 'TOO_LARGE',
			limit: LIMITS.request,
			message: 'open a direct connection first'
		});
		assert.deepEqual(received, []);
		const [connection] = consumerNode.getConnections(providerNode.peerId);
		assert.ok(connection.limits, 'the relayed connection');
		// The provider, too, holds a limited connection to 64 KiB.
		assert.equal(await sendPrefix(consumerNode, providerNode.peerId, 70 * 1024), 'refused');
	});

	test('a relay that grants at least 32 MiB carries the stated limit', async () => {
		const { consumer, consumerNode, providerNode, received } = await throughRelay({
			defaultDataLimit: 10n * 1024n ** 3n,
			defaultDurationLimit: 20 * 60 * 1000
		});
		const peer = providerNode.peerId.toString();
		const answer = await consumer.call(peer, 'belege-bridge', 'read', { text: LONG });
		assert.equal(answer.chars, LONG.length);
		assert.deepEqual(received, [LONG.length]);
		assert.ok(consumerNode.getConnections(providerNode.peerId)[0].limits, 'still relayed');
	});
});
