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

describe('a new connection that does not come', () => {
	test('the call goes over the relayed connection that is open', async () => {
		// Once a minute the consumer lets libp2p dial, in case a direct
		// connection comes back. When that dial fails – a WebRTC upgrade that
		// stalls, then libp2p refusing a second connection to the same relayed
		// address ("Duplicate multiaddr connection") – the relayed connection
		// is still there and still carries the call.
		let clock = Date.now();
		const late = createConsumer({ libp2p: consumerNode, label: 'Belege', now: () => clock });
		await late.start();
		const peer = providerNode.peerId.toString();
		await late.addProvider(through);
		await late.call(peer, 'invoice', 'help', {});
		clock += 61_000;
		const dialProtocol = consumerNode.dialProtocol.bind(consumerNode);
		let refused = 0;
		consumerNode.dialProtocol = async () => {
			refused++;
			const error = new Error('Duplicate multiaddr connection');
			error.name = 'InvalidMultiaddrError';
			throw error;
		};
		try {
			const before = served;
			const answer = await late.call(peer, 'invoice', 'help', {});
			assert.equal(refused, 1, 'libp2p was left to dial once');
			assert.equal(answer.served, before + 1);
			const connections = consumerNode.getConnections(providerNode.peerId);
			assert.equal(connections.length, 1);
			assert.ok(connections[0].limits, 'over the relayed connection');
		} finally {
			consumerNode.dialProtocol = dialProtocol;
			await late.stop?.();
		}
	});
});

describe('a dial that fails beside an open connection', () => {
	test('the provider is found over the relayed connection that is open', async () => {
		// The browser's case (Belege): the invitation names the provider's
		// WebRTC address through the relay too. WebRTC does not come up, libp2p
		// tries the relayed address next and refuses it as a duplicate of the
		// relayed connection WebRTC was signalled over – which is open.
		let clock = Date.now();
		const fresh = createConsumer({ libp2p: consumerNode, label: 'Belege', now: () => clock });
		await fresh.start();
		assert.ok(consumerNode.getConnections(providerNode.peerId).length, 'a connection is open');
		// A minute on: libp2p is left to dial again, in case it comes back direct.
		clock += 61_000;
		const dial = consumerNode.dial.bind(consumerNode);
		let refused = 0;
		consumerNode.dial = async () => {
			refused++;
			const error = new Error('Duplicate multiaddr connection');
			error.name = 'InvalidMultiaddrError';
			throw error;
		};
		try {
			const found = await fresh.addProvider(through);
			assert.equal(refused, 1, 'libp2p was left to dial once');
			assert.equal(found.reachable, true);
		} finally {
			consumerNode.dial = dial;
			await fresh.stop?.();
		}
	});
});
