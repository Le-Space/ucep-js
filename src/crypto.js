// SPDX-License-Identifier: MIT
// The few primitives UCEP needs, on WebCrypto, so the library runs the same
// in browsers and in Node 22.

const subtle = globalThis.crypto.subtle;
const encoder = new TextEncoder();

/** @param {string} text */
export const utf8 = (text) => encoder.encode(text);

/** @param {Uint8Array} bytes */
export const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** @param {string} hex */
export function fromHex(hex) {
	if (!/^([0-9a-f]{2})*$/i.test(hex)) throw new Error('Not hex');
	return Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
}

/** @param {Uint8Array} bytes */
export function toBase64url(bytes) {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {string} text */
export function fromBase64url(text) {
	if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('Not base64url');
	const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
	const s = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
	return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** @param {number} n */
export const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** @param {Uint8Array} data */
export async function sha256(data) {
	return new Uint8Array(await subtle.digest('SHA-256', data));
}

/** @param {Uint8Array} key @param {Uint8Array} data */
export async function hmacSha256(key, data) {
	const k = await subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return new Uint8Array(await subtle.sign('HMAC', k, data));
}

/**
 * Equal bytes, compared in time that does not depend on where they differ.
 *
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 */
export function constantTimeEqual(a, b) {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

/** @param {...Uint8Array} parts */
export function concat(...parts) {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}
