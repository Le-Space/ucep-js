// SPDX-License-Identifier: MIT
// Pairing transcripts, the invitation proof and the short authentication
// string (ucep-auth.md §4, §5.2). Deterministic; checked against the spec's
// test vectors.

import { hmacSha256, sha256, toHex, utf8 } from './crypto.js';

/** Scopes sorted by their UTF-8 bytes, joined with ",". @param {string[]} scopes */
export function scopeLine(scopes) {
	return [...scopes]
		.sort((a, b) => {
			const x = utf8(a);
			const y = utf8(b);
			for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
			return x.length - y.length;
		})
		.join(',');
}

/**
 * The invitation-mode transcript (§4): seven lines.
 *
 * @param {{ extensionId: string, invitationId: string, providerPeerId: string, consumerPeerId: string, scopes: string[], did?: string }} p
 */
export function invitationTranscript(p) {
	return utf8(
		[
			'ucep-pair-v1',
			p.extensionId,
			p.invitationId,
			p.providerPeerId,
			p.consumerPeerId,
			scopeLine(p.scopes),
			p.did ?? ''
		].join('\n')
	);
}

/**
 * The in-band transcript (§5.2): nine lines.
 *
 * @param {{ extensionId: string, pairingId: string, providerPeerId: string, consumerPeerId: string, scopes: string[], did?: string, nonceC: Uint8Array, nonceP: Uint8Array }} p
 */
export function inBandTranscript(p) {
	return utf8(
		[
			'ucep-pair-inband-v1',
			p.extensionId,
			p.pairingId,
			p.providerPeerId,
			p.consumerPeerId,
			scopeLine(p.scopes),
			p.did ?? '',
			toHex(p.nonceC),
			toHex(p.nonceP)
		].join('\n')
	);
}

/** HMAC-SHA256(secret, transcript) @param {Uint8Array} secret @param {Uint8Array} transcript */
export const pairingProof = (secret, transcript) => hmacSha256(secret, transcript);

/** @param {Uint8Array} transcript */
export const transcriptHash = (transcript) => sha256(transcript);

/**
 * Six digits: the first four bytes of the transcript hash, big-endian,
 * modulo 1 000 000.
 *
 * @param {Uint8Array} hash
 */
export function shortAuthString(hash) {
	const n = ((hash[0] << 24) >>> 0) + (hash[1] << 16) + (hash[2] << 8) + hash[3];
	return String(n % 1_000_000).padStart(6, '0');
}
