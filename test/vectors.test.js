// SPDX-License-Identifier: MIT
// Conformance with the spec's test vectors (ucep-spec/test-vectors/pairing-v1.json).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fromHex, sha256, toHex } from '../src/crypto.js';
import { verifyDidProof } from '../src/did.js';
import { encodeInvitation, parseInvitation, parseProviderInput, wrapInLink } from '../src/links.js';
import {
	inBandTranscript,
	invitationTranscript,
	pairingProof,
	shortAuthString,
	transcriptHash
} from '../src/transcript.js';

const V = JSON.parse(readFileSync(new URL('./fixtures/pairing-v1.json', import.meta.url), 'utf8'));
const inv = V.invitation;

describe('invitation URI', () => {
	test('encodes exactly as the vector, and parses back', () => {
		const invitation = {
			providerPeerId: inv.providerPeerId,
			extensionId: inv.extensionId,
			invitationId: inv.invitationId,
			secret: fromHex(inv.secretHex),
			expiresAt: inv.expiresAt,
			scopes: inv.scopes,
			addrs: inv.addrs
		};
		assert.equal(encodeInvitation(invitation), inv.invitation);
		assert.deepEqual(parseInvitation(inv.invitation), invitation);
		assert.deepEqual(parseInvitation(inv.link), invitation);
		assert.equal(wrapInLink('https://app.example.com/', inv.invitation), inv.link);
	});

	test('refuses what is malformed, and an invitation in a query', () => {
		assert.throws(() => parseInvitation(inv.invitation.replace('v=1', 'v=2')), /version/);
		assert.throws(() => parseInvitation(inv.invitation.replace(/s=[^&]+/, 's=AAAA')), /32 bytes/);
		assert.throws(
			() => parseInvitation(inv.invitation.replace('invoice%3Aeigenbeleg', 'other%3Aeigenbeleg')),
			/scope/
		);
		assert.throws(() =>
			parseInvitation(`https://app.example.com/?ucep=${encodeURIComponent(inv.invitation)}`)
		);
	});
});

describe('provider input', () => {
	test('a PeerId, a multiaddr, a provider link; not an invitation', () => {
		assert.deepEqual(parseProviderInput(inv.providerPeerId), {
			peerId: inv.providerPeerId,
			addrs: [],
			extensionIds: []
		});
		assert.equal(parseProviderInput(inv.addrs[0]).peerId, inv.providerPeerId);
		const link = `web+ucep:peer?v=1&peer=${inv.providerPeerId}&addr=${encodeURIComponent(inv.addrs[1])}&ext=invoice`;
		assert.deepEqual(parseProviderInput(link), {
			peerId: inv.providerPeerId,
			addrs: [inv.addrs[1]],
			extensionIds: ['invoice']
		});
		assert.throws(() => parseProviderInput(inv.invitation), /invitation/);
		assert.throws(() => parseProviderInput('12D3KooWnotapeerid'));
	});
});

describe('invitation-mode vectors', () => {
	for (const v of V.vectors) {
		test(v.name, async () => {
			const t = invitationTranscript({
				extensionId: inv.extensionId,
				invitationId: inv.invitationId,
				providerPeerId: inv.providerPeerId,
				consumerPeerId: v.connectionConsumerPeerId,
				scopes: v.requestedScopes,
				did: v.did ?? undefined
			});
			const hash = await transcriptHash(t);
			if (v.expected !== 'PAIRING_PROOF_INVALID') {
				assert.equal(toHex(t), v.transcriptHex);
				assert.equal(toHex(hash), v.transcriptHashHex);
				assert.equal(shortAuthString(hash), v.sas);
			}
			const proof = await pairingProof(fromHex(inv.secretHex), t);
			assert.equal(toHex(proof) === v.proofHex, v.expected !== 'PAIRING_PROOF_INVALID');
			if (v.didSignatureHex && v.expected !== 'PAIRING_PROOF_INVALID') {
				assert.equal(
					await verifyDidProof(
						v.did,
						{ format: 'RAW', signature: fromHex(v.didSignatureHex) },
						hash
					),
					true
				);
			}
		});
	}
});

describe('in-band vectors', () => {
	for (const v of V.inBandVectors) {
		test(v.name, async () => {
			const revealed = fromHex(v.revealedNonceHex);
			const matches = toHex(await sha256(revealed)) === v.commitmentHex;
			assert.equal(matches, v.expected !== 'COMMITMENT_MISMATCH');
			if (!matches) return;
			const hash = await transcriptHash(
				inBandTranscript({
					extensionId: inv.extensionId,
					pairingId: v.pairingId,
					providerPeerId: inv.providerPeerId,
					consumerPeerId: v.connectionConsumerPeerId,
					scopes: v.requestedScopes,
					did: v.did ?? undefined,
					nonceC: revealed,
					nonceP: fromHex(v.noncePHex)
				})
			);
			assert.equal(toHex(hash), v.transcriptHashHex);
			assert.equal(shortAuthString(hash), v.sas);
			if (v.didSignatureHex) {
				assert.equal(
					await verifyDidProof(
						v.did,
						{ format: 'RAW', signature: fromHex(v.didSignatureHex) },
						hash
					),
					true
				);
				// a signature over another transcript does not verify
				assert.equal(
					await verifyDidProof(
						v.did,
						{ format: 'RAW', signature: fromHex(v.didSignatureHex) },
						new Uint8Array(32)
					),
					false
				);
			}
		});
	}
});
