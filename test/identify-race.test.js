// SPDX-License-Identifier: MIT
// Pairing while identify is still on its way. libp2p records `/ipfs/id/1.0.0`
// in the peer store as soon as it opens the identify stream; over a relay with
// real latency the consumer read that list before identify had answered and
// refused a provider that serves the extension (UNKNOWN_EXTENSION). Here the
// peer store is made to answer as it did then.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createLibp2p } from 'libp2p';
import { memory } from '@libp2p/memory';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify, identifyPush } from '@libp2p/identify';

import { createConsumer, createProvider } from '../src/index.js';

async function node(/** @type {string} */ name) {
	return createLibp2p({
		addresses: { listen: [`/memory/${name}-${Math.random().toString(36).slice(2)}`] },
		transports: [memory()],
		connectionEncrypters: [noise()],
		streamMuxers: [yamux()],
		services: { identify: identify(), identifyPush: identifyPush() }
	});
}

/** @type {any} */ let providerNode;
/** @type {any} */ let consumerNode;
/** @type {any} */ let provider;
/** @type {any} */ let consumer;

before(async () => {
	[providerNode, consumerNode] = await Promise.all([node('provider'), node('consumer')]);
	provider = createProvider({
		libp2p: providerNode,
		manifest: {
			id: 'invoice',
			name: 'Rechnungen',
			version: '0.1.0',
			scopes: [{ name: 'invoice:document:read', description: 'Lesen' }]
		},
		commands: { help: { handler: () => ({ ok: true }) } }
	});
	await provider.start();
	consumer = createConsumer({ libp2p: consumerNode, label: 'Belege' });
	await consumer.start();
});

after(async () => {
	await Promise.all([providerNode?.stop(), consumerNode?.stop()]);
});

describe('pairing while identify is on its way', () => {
	test('waits for identify when the peer store names no extension yet', async () => {
		const { uri } = await provider.createInvitation({ scopes: ['invoice:document:read'] });
		// The peer store as it answered over the relay: only the identify protocol.
		const get = consumerNode.peerStore.get.bind(consumerNode.peerStore);
		let early = true;
		consumerNode.peerStore.get = async (/** @type {any} */ id) => {
			const peer = await get(id);
			if (early && id.equals(providerNode.peerId)) {
				early = false;
				return { ...peer, protocols: ['/ipfs/id/1.0.0'] };
			}
			return peer;
		};
		try {
			await consumer.pairWithInvitation(uri);
		} finally {
			consumerNode.peerStore.get = get;
		}
		assert.equal((await consumer.grants()).length, 1);
		const answer = await consumer.call(providerNode.peerId.toString(), 'invoice', 'help', {});
		assert.deepEqual(answer, { ok: true });
	});
});
