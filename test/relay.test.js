// SPDX-License-Identifier: MIT
// Consumer and provider reached only through a circuit relay (ucep.md §5.1),
// as two browsers are: three real libp2p nodes over WebSockets on this
// machine (circuit relay v2 takes IP and DNS addresses only, not memory ones).
// A relayed connection is limited, and libp2p dials a new one for every call
// while it is the only one; the consumer reuses it instead.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify, identifyPush } from '@libp2p/identify';
import { circuitRelayServer, circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { multiaddr } from '@multiformats/multiaddr';

import { createConsumer, createProvider } from '../src/index.js';

const base = () => ({
	connectionEncrypters: [noise()],
	streamMuxers: [yamux()],
	// 127.0.0.1 is a private address, which libp2p does not dial by default.
	connectionGater: { denyDialMultiaddr: () => false }
});

/** @type {any} */ let relay;
/** @type {any} */ let providerNode;
/** @type {any} */ let consumerNode;
/** @type {any} */ let provider;
/** @type {any} */ let consumer;
/** @type {string} */ let through;
let served = 0;

before(async () => {
	relay = await createLibp2p({
		...base(),
		addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
		transports: [webSockets()],
		services: { identify: identify(), relay: circuitRelayServer() }
	});
	const relayAddr = relay.getMultiaddrs()[0].toString();

	providerNode = await createLibp2p({
		...base(),
		addresses: { listen: [`${relayAddr}/p2p-circuit`] },
		transports: [webSockets(), circuitRelayTransport()],
		services: { identify: identify(), identifyPush: identifyPush() }
	});
	// The reservation: before it, nobody reaches the provider through the relay.
	for (let i = 0; i < 100; i++) {
		if (providerNode.getMultiaddrs().some((a) => a.toString().includes('/p2p-circuit/'))) break;
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	through = `${relayAddr}/p2p-circuit/p2p/${providerNode.peerId}`;

	provider = createProvider({
		libp2p: providerNode,
		manifest: { id: 'invoice', name: 'Rechnungen', version: '0.1.0' },
		commands: { help: { handler: () => ({ served: ++served }) } }
	});
	await provider.start();

	consumerNode = await createLibp2p({
		...base(),
		transports: [webSockets(), circuitRelayTransport()],
		services: { identify: identify(), identifyPush: identifyPush() }
	});
	await consumerNode.dial(multiaddr(relayAddr));
	consumer = createConsumer({ libp2p: consumerNode, label: 'Belege' });
	await consumer.start();
});

after(async () => {
	await Promise.all([consumerNode?.stop(), providerNode?.stop(), relay?.stop()]);
});

describe('through a relay', () => {
	test('many calls share one relayed connection, and none is refused', async () => {
		const found = await consumer.addProvider(through);
		assert.equal(found.reachable, true);
		const peer = providerNode.peerId.toString();
		// More than libp2p's inbound threshold of five new connections a second
		// from one address, which every relayed connection comes from.
		for (let i = 0; i < 8; i++) {
			const answer = await consumer.call(peer, 'invoice', 'help', {});
			assert.equal(answer.served, i + 1);
		}
		const connections = consumerNode.getConnections(providerNode.peerId);
		assert.equal(connections.length, 1);
		assert.ok(connections[0].limits, 'the connection is the relayed one');
	});
});
