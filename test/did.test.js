// SPDX-License-Identifier: MIT
// DID binding (ucep-auth.md §9) with keys made here: Ed25519 RAW, P-256 RAW,
// and a P-256 passkey assertion (WEBAUTHN), including what must fail.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { concat, sha256, toBase64url, utf8 } from '../src/crypto.js';
import { parseDidKey, verifyDidProof } from '../src/did.js';

const subtle = globalThis.crypto.subtle;
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** @param {Uint8Array} bytes */
function base58btc(bytes) {
	let n = 0n;
	for (const b of bytes) n = (n << 8n) | BigInt(b);
	let out = '';
	while (n > 0n) {
		out = B58[Number(n % 58n)] + out;
		n /= 58n;
	}
	let zeros = 0;
	while (bytes[zeros] === 0) zeros++;
	return '1'.repeat(zeros) + out;
}

/** P1363 r ‖ s → ASN.1 DER, as an authenticator returns it. @param {Uint8Array} raw */
function rawToDer(raw) {
	/** @param {Uint8Array} v */
	const int = (v) => {
		let i = 0;
		while (i < v.length - 1 && v[i] === 0) i++;
		const x = v[i] & 0x80 ? concat(Uint8Array.of(0), v.slice(i)) : v.slice(i);
		return concat(Uint8Array.of(0x02, x.length), x);
	};
	const body = concat(int(raw.slice(0, 32)), int(raw.slice(32)));
	return concat(Uint8Array.of(0x30, body.length), body);
}

async function ed25519Did() {
	const keys = /** @type {CryptoKeyPair} */ (
		await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
	);
	const pub = new Uint8Array(await subtle.exportKey('raw', keys.publicKey));
	return { did: `did:key:z${base58btc(concat(Uint8Array.of(0xed, 0x01), pub))}`, keys };
}

async function p256Did() {
	const keys = /** @type {CryptoKeyPair} */ (
		await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
	);
	const raw = new Uint8Array(await subtle.exportKey('raw', keys.publicKey)); // 0x04 ‖ x ‖ y
	const compressed = concat(Uint8Array.of(2 + (raw[64] & 1)), raw.slice(1, 33));
	return { did: `did:key:z${base58btc(concat(Uint8Array.of(0x80, 0x24), compressed))}`, keys, raw };
}

describe('did:key', () => {
	test('Ed25519 and P-256 (compressed, decompressed exactly)', async () => {
		const ed = await ed25519Did();
		assert.equal(parseDidKey(ed.did).type, 'Ed25519');
		const p = await p256Did();
		const parsed = parseDidKey(p.did);
		assert.equal(parsed.type, 'P-256');
		assert.deepEqual(parsed.publicKey, p.raw);
		assert.throws(() => parseDidKey('did:web:example.com'));
	});

	test('RAW: Ed25519 and P-256 signatures over the transcript hash', async () => {
		const hash = await sha256(utf8('ucep-pair-v1\ninvoice\n…'));
		const ed = await ed25519Did();
		const edSig = new Uint8Array(await subtle.sign('Ed25519', ed.keys.privateKey, hash));
		assert.equal(await verifyDidProof(ed.did, { format: 'RAW', signature: edSig }, hash), true);
		const p = await p256Did();
		const pSig = new Uint8Array(
			await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, p.keys.privateKey, hash)
		);
		assert.equal(await verifyDidProof(p.did, { format: 'RAW', signature: pSig }, hash), true);
		// another key, another hash: no
		assert.equal(await verifyDidProof(p.did, { format: 'RAW', signature: edSig }, hash), false);
		assert.equal(
			await verifyDidProof(ed.did, { format: 'RAW', signature: edSig }, new Uint8Array(32)),
			false
		);
	});

	test('WEBAUTHN: a passkey assertion with the transcript hash as challenge', async () => {
		const hash = await sha256(utf8('ucep-pair-inband-v1\ninvoice\n…'));
		const p = await p256Did();
		const authData = concat(new Uint8Array(32), Uint8Array.of(0x05), new Uint8Array(4)); // UP + UV
		/** @param {Record<string, unknown>} client @param {Uint8Array} [data] */
		const assertion = async (client, data = authData) => {
			const clientDataJSON = utf8(JSON.stringify(client));
			const signed = concat(data, await sha256(clientDataJSON));
			const raw = new Uint8Array(
				await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, p.keys.privateKey, signed)
			);
			return /** @type {const} */ ({
				format: 'WEBAUTHN',
				signature: rawToDer(raw),
				authenticatorData: data,
				clientDataJSON
			});
		};
		const good = {
			type: 'webauthn.get',
			challenge: toBase64url(hash),
			origin: 'https://app.example.com'
		};
		assert.equal(await verifyDidProof(p.did, await assertion(good), hash), true);
		assert.equal(
			await verifyDidProof(p.did, await assertion({ ...good, type: 'webauthn.create' }), hash),
			false
		);
		assert.equal(
			await verifyDidProof(
				p.did,
				await assertion({ ...good, challenge: toBase64url(new Uint8Array(32)) }),
				hash
			),
			false
		);
		const notPresent = concat(new Uint8Array(32), Uint8Array.of(0x00), new Uint8Array(4));
		assert.equal(await verifyDidProof(p.did, await assertion(good, notPresent), hash), false);
	});
});
