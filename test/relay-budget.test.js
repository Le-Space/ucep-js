// SPDX-License-Identifier: MIT
// How big an answer may be through a relay (ucep.md §11): a relay with
// js-libp2p's default data limit (128 KiB) caps answers at 64 KiB; a relay
// that grants a connection at least RELAY_BUDGET lets a full answer through,
// as a direct connection does.

import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify, identifyPush } from '@libp2p/identify';
import { circuitRelayServer, circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { multiaddr } from '@multiformats/multiaddr';

import { LIMITS, RELAY_BUDGET, createConsumer, createProvider, isLimited } from '../src/index.js';

const base = () => ({
	connectionEncrypters: [noise()],
	streamMuxers: [yamux()],
	// 127.0.0.1 is a private address, which libp2p does not dial by default.
	connectionGater: { denyDialMultiaddr: () => false }
});

/** An answer of about 200 KiB: above the limited cap, below the full one. */
const BIG = 'x'.repeat(200 * 1024);

/** @type {any[]} */
const nodes = [];
after(async () => {
	await Promise.all(nodes.map((n) => n.stop()));
});

/**
 * Relay, provider behind it, consumer that reaches the provider only through it.
 *
 * @param {object} [reservations] the relay's `circuitRelayServer` reservations
 */
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
	/** @type {boolean[]} */
	const seen = [];
	const provider = createProvider({
		libp2p: providerNode,
		manifest: { id: 'invoice', name: 'Rechnungen', version: '0.1.0' },
		commands: {
			big: {
				handler: ({ limited }) => {
					seen.push(limited);
					return { text: BIG };
				}
			}
		}
	});
	await provider.start();

	const consumerNode = await createLibp2p({
		...base(),
		transports: [webSockets(), circuitRelayTransport()],
		services: { identify: identify(), identifyPush: identifyPush() }
	});
	nodes.push(consumerNode);
	await consumerNode.dial(multiaddr(relayAddr));
	const consumer = createConsumer({ libp2p: consumerNode, label: 'Belege' });
	await consumer.start();
	const found = await consumer.addProvider(`${relayAddr}/p2p-circuit/p2p/${providerNode.peerId}`);
	assert.equal(found.reachable, true);
	return { consumer, consumerNode, providerNode, seen };
}

describe('the size of an answer through a relay', () => {
	test('isLimited: by the relay’s data limit, not by being relayed', () => {
		assert.equal(isLimited({}), false);
		assert.equal(isLimited({ limits: null }), false);
		assert.equal(isLimited({ limits: { seconds: 120 } }), false);
		assert.equal(isLimited({ limits: { bytes: 1n << 17n, seconds: 120 } }), true);
		assert.equal(isLimited({ limits: { bytes: BigInt(RELAY_BUDGET) - 1n } }), true);
		assert.equal(isLimited({ limits: { bytes: BigInt(RELAY_BUDGET) } }), false);
		assert.equal(isLimited({ limits: { bytes: 10n * 1024n ** 3n } }), false);
	});

	test('libp2p’s default relay: 64 KiB, a bigger answer is TOO_LARGE', async () => {
		const { consumer, consumerNode, providerNode, seen } = await throughRelay();
		const peer = providerNode.peerId.toString();
		await assert.rejects(consumer.call(peer, 'invoice', 'big', {}), { code: 'TOO_LARGE' });
		assert.deepEqual(seen, [true]);
		const [connection] = consumerNode.getConnections(providerNode.peerId);
		assert.ok(connection.limits, 'the connection is the relayed one');
		assert.ok(BIG.length < LIMITS.response && BIG.length > LIMITS.limitedResponse);
	});

	test('a relay that grants more: the full answer, over the same relayed connection', async () => {
		const { consumer, consumerNode, providerNode, seen } = await throughRelay({
			defaultDataLimit: 10n * 1024n ** 3n,
			defaultDurationLimit: 20 * 60 * 1000
		});
		const peer = providerNode.peerId.toString();
		const answer = await consumer.call(peer, 'invoice', 'big', {});
		assert.equal(answer.text.length, BIG.length);
		assert.deepEqual(seen, [false]);
		const connections = consumerNode.getConnections(providerNode.peerId);
		assert.equal(connections.length, 1);
		assert.ok(connections[0].limits, 'still the relayed connection');
	});
});
