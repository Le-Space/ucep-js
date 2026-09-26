// SPDX-License-Identifier: MIT
// Binding a DID to a pairing (ucep-auth.md §9): `did:key` with an Ed25519 or
// a P-256 key, proved by a signature over the transcript hash – made
// directly (RAW) or by a passkey (WEBAUTHN). WebCrypto only.

import { concat, sha256, toBase64url } from './crypto.js';

const subtle = globalThis.crypto.subtle;
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** @param {string} text */
function base58btcDecode(text) {
	let n = 0n;
	for (const c of text) {
		const i = B58.indexOf(c);
		if (i < 0) throw new Error('Not base58btc');
		n = n * 58n + BigInt(i);
	}
	/** @type {number[]} */
	const bytes = [];
	while (n > 0n) {
		bytes.unshift(Number(n & 0xffn));
		n >>= 8n;
	}
	let zeros = 0;
	while (text[zeros] === '1') zeros++;
	return Uint8Array.from([...new Array(zeros).fill(0), ...bytes]);
}

// P-256 curve constants, to decompress a public key (WebCrypto takes only uncompressed ones).
const P = 2n ** 256n - 2n ** 224n + 2n ** 192n + 2n ** 96n - 1n;
const B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;

/** @param {bigint} base @param {bigint} exp @param {bigint} mod */
function modPow(base, exp, mod) {
	let result = 1n;
	let b = base % mod;
	let e = exp;
	while (e > 0n) {
		if (e & 1n) result = (result * b) % mod;
		b = (b * b) % mod;
		e >>= 1n;
	}
	return result;
}

/** @param {bigint} n */
const bytes32 = (n) =>
	Uint8Array.from(n.toString(16).padStart(64, '0').match(/../g) ?? [], (h) => parseInt(h, 16));

/** 33-byte compressed → 65-byte uncompressed P-256 point. @param {Uint8Array} compressed */
export function decompressP256(compressed) {
	if (compressed.length !== 33 || (compressed[0] !== 2 && compressed[0] !== 3)) {
		throw new Error('Not a compressed P-256 key');
	}
	const x = BigInt(
		`0x${Array.from(compressed.slice(1), (b) => b.toString(16).padStart(2, '0')).join('')}`
	);
	const rhs = (((x * x * x - 3n * x + B) % P) + P) % P;
	let y = modPow(rhs, (P + 1n) / 4n, P);
	if ((y * y) % P !== rhs) throw new Error('Not a point on P-256');
	if ((y & 1n) !== BigInt(compressed[0] & 1)) y = P - y;
	return concat(Uint8Array.of(4), bytes32(x), bytes32(y));
}

/**
 * @param {string} did
 * @returns {{ type: 'Ed25519' | 'P-256', publicKey: Uint8Array }}
 */
export function parseDidKey(did) {
	if (!did.startsWith('did:key:z')) throw new Error('Only did:key with base58btc is supported');
	const bytes = base58btcDecode(did.slice('did:key:z'.length));
	if (bytes[0] === 0xed && bytes[1] === 0x01 && bytes.length === 34) {
		return { type: 'Ed25519', publicKey: bytes.slice(2) };
	}
	if (bytes[0] === 0x80 && bytes[1] === 0x24 && bytes.length === 35) {
		return { type: 'P-256', publicKey: decompressP256(bytes.slice(2)) };
	}
	throw new Error('Unsupported did:key type');
}

/** An ASN.1 DER ECDSA signature → IEEE P1363 (r ‖ s, 64 bytes). @param {Uint8Array} der */
export function derToRaw(der) {
	if (der[0] !== 0x30) throw new Error('Not a DER signature');
	let at = 2;
	/** @returns {Uint8Array} */
	const int = () => {
		if (der[at] !== 0x02) throw new Error('Not a DER signature');
		const len = der[at + 1];
		let v = der.slice(at + 2, at + 2 + len);
		at += 2 + len;
		while (v.length > 32 && v[0] === 0) v = v.slice(1);
		if (v.length > 32) throw new Error('Not a P-256 signature');
		return concat(new Uint8Array(32 - v.length), v);
	};
	return concat(int(), int());
}

/**
 * @param {{ type: 'Ed25519' | 'P-256', publicKey: Uint8Array }} key
 * @param {Uint8Array} signature Ed25519: 64 bytes; P-256: r ‖ s
 * @param {Uint8Array} data
 */
async function verify(key, signature, data) {
	if (key.type === 'Ed25519') {
		const k = await subtle.importKey('raw', key.publicKey, { name: 'Ed25519' }, false, ['verify']);
		return subtle.verify('Ed25519', k, signature, data);
	}
	const k = await subtle.importKey(
		'raw',
		key.publicKey,
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['verify']
	);
	return subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, signature, data);
}

/**
 * @typedef {object} DidProof as in messages.proto
 * @property {'RAW' | 'WEBAUTHN' | 'FORMAT_UNSPECIFIED'} format
 * @property {Uint8Array} signature
 * @property {Uint8Array} [authenticatorData]
 * @property {Uint8Array} [clientDataJSON]
 */

/**
 * Whether `proof` shows that the holder of `did` signed `transcriptHash`.
 *
 * @param {string} did
 * @param {DidProof} proof
 * @param {Uint8Array} transcriptHash
 */
export async function verifyDidProof(did, proof, transcriptHash) {
	try {
		const key = parseDidKey(did);
		if (proof.format === 'RAW') return await verify(key, proof.signature, transcriptHash);
		if (proof.format !== 'WEBAUTHN' || key.type !== 'P-256') return false;
		const authData = proof.authenticatorData ?? new Uint8Array();
		const clientDataJSON = proof.clientDataJSON ?? new Uint8Array();
		const client = JSON.parse(new TextDecoder().decode(clientDataJSON));
		if (client.type !== 'webauthn.get') return false;
		if (client.challenge !== toBase64url(transcriptHash)) return false;
		if (authData.length < 37 || (authData[32] & 0x01) === 0) return false; // user present
		const signed = concat(authData, await sha256(clientDataJSON));
		return await verify(key, derToRaw(proof.signature), signed);
	} catch {
		return false;
	}
}
