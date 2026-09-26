// SPDX-License-Identifier: MIT
// What people pass between apps: invitations (`web+ucep:pair?…`, they grant
// pairing, ucep-auth.md §3) and provider links (`web+ucep:peer?…`, they only
// say where a peer is, ucep.md §4.2) – as URIs, or wrapped into the fragment
// of an https link. Also the one input field of "add by PeerId".

import { peerIdFromString } from '@libp2p/peer-id';
import { multiaddr } from '@multiformats/multiaddr';

import { fromBase64url, toBase64url } from './crypto.js';
import { isScope } from './protocol.js';

const e = encodeURIComponent;

/**
 * @typedef {object} Invitation
 * @property {string} providerPeerId
 * @property {string} extensionId
 * @property {string} invitationId
 * @property {Uint8Array} secret 32 bytes
 * @property {number} expiresAt Unix seconds
 * @property {string[]} scopes
 * @property {string[]} addrs
 */

/**
 * `web+ucep:pair?v=1&peer=…&ext=…&inv=…&s=…&exp=…&scope=…,…&addr=…`
 *
 * @param {Invitation} inv
 */
export function encodeInvitation(inv) {
	return (
		`web+ucep:pair?v=1&peer=${e(inv.providerPeerId)}&ext=${e(inv.extensionId)}` +
		`&inv=${e(inv.invitationId)}&s=${e(toBase64url(inv.secret))}&exp=${e(String(inv.expiresAt))}` +
		`&scope=${inv.scopes.map(e).join(',')}` +
		inv.addrs.map((a) => `&addr=${e(a)}`).join('')
	);
}

/**
 * `web+ucep:peer?v=1&peer=…&addr=…&ext=…` – no secret.
 *
 * @param {{ peerId: string, addrs?: string[], extensionIds?: string[] }} link
 */
export function encodeProviderLink({ peerId, addrs = [], extensionIds = [] }) {
	return (
		`web+ucep:peer?v=1&peer=${e(peerId)}` +
		addrs.map((a) => `&addr=${e(a)}`).join('') +
		extensionIds.map((x) => `&ext=${e(x)}`).join('')
	);
}

/** `https://app.example.com/#ucep=<uri>` @param {string} appUrl @param {string} uri */
export function wrapInLink(appUrl, uri) {
	const url = new URL(appUrl);
	url.hash = `ucep=${e(uri)}`;
	return url.toString();
}

/**
 * The `web+ucep:` URI in a text: itself, or unwrapped from an https fragment.
 *
 * @param {string} text
 */
function unwrap(text) {
	const s = String(text).trim();
	if (s.startsWith('web+ucep:')) return s;
	try {
		const url = new URL(s);
		if (url.protocol === 'https:' || url.protocol === 'http:') {
			const m = /(?:^#|&)ucep=([^&]+)/.exec(url.hash);
			if (m) return decodeURIComponent(m[1]);
			// The invitation must never be in the path or the query (ucep-auth.md §3).
		}
	} catch {
		// not a URL
	}
	return null;
}

/** @param {string} query */
function params(query) {
	/** @type {Map<string, string[]>} */
	const out = new Map();
	for (const part of query.split('&').filter(Boolean)) {
		const i = part.indexOf('=');
		const key = i < 0 ? part : part.slice(0, i);
		const value = i < 0 ? '' : part.slice(i + 1);
		out.set(key, [...(out.get(key) ?? []), value]);
	}
	return out;
}

/** @param {string} id */
function validPeerId(id) {
	peerIdFromString(id);
	return id;
}

/**
 * Parse an invitation. Throws on anything malformed; does not check expiry.
 *
 * @param {string} text the URI, or an https link carrying it in its fragment
 * @returns {Invitation}
 */
export function parseInvitation(text) {
	const uri = unwrap(text);
	if (!uri || !uri.startsWith('web+ucep:pair?')) throw new Error('Not a UCEP invitation');
	const p = params(uri.slice('web+ucep:pair?'.length));
	const one = (/** @type {string} */ k) => {
		const v = p.get(k);
		if (!v || v.length !== 1) throw new Error(`Invitation: ${k} missing or repeated`);
		return decodeURIComponent(v[0]);
	};
	if (one('v') !== '1') throw new Error('Invitation: unknown version');
	const secret = fromBase64url(one('s'));
	if (secret.length !== 32) throw new Error('Invitation: the secret is not 32 bytes');
	const extensionId = one('ext');
	const scopes = (p.get('scope')?.[0] ?? '').split(',').filter(Boolean).map(decodeURIComponent);
	if (!scopes.every((s) => isScope(s, extensionId))) throw new Error('Invitation: bad scope');
	const expiresAt = Number(one('exp'));
	if (!Number.isSafeInteger(expiresAt)) throw new Error('Invitation: bad expiry');
	const addrs = (p.get('addr') ?? []).map(decodeURIComponent);
	for (const a of addrs) multiaddr(a);
	return {
		providerPeerId: validPeerId(one('peer')),
		extensionId,
		invitationId: one('inv'),
		secret,
		expiresAt,
		scopes,
		addrs
	};
}

/**
 * The one input of "add by PeerId" (ucep.md §4.2): a bare PeerId, a
 * multiaddr ending in /p2p/<PeerId>, or a provider link. An invitation is
 * refused here: it belongs to pairing.
 *
 * @param {string} text
 * @returns {{ peerId: string, addrs: string[], extensionIds: string[] }}
 */
export function parseProviderInput(text) {
	const s = String(text).trim();
	const uri = unwrap(s);
	if (uri?.startsWith('web+ucep:pair?')) throw new Error('This is an invitation; use it to pair.');
	if (uri?.startsWith('web+ucep:peer?')) {
		const p = params(uri.slice('web+ucep:peer?'.length));
		if (p.get('v')?.[0] !== '1') throw new Error('Provider link: unknown version');
		const addrs = (p.get('addr') ?? []).map(decodeURIComponent);
		for (const a of addrs) multiaddr(a);
		return {
			peerId: validPeerId(decodeURIComponent(p.get('peer')?.[0] ?? '')),
			addrs,
			extensionIds: (p.get('ext') ?? []).map(decodeURIComponent)
		};
	}
	if (s.startsWith('/')) {
		const ma = multiaddr(s);
		const peerId = ma.getComponents().findLast((c) => c.name === 'p2p')?.value;
		if (!peerId) throw new Error('The multiaddr does not end in /p2p/<PeerId>');
		return { peerId: validPeerId(peerId), addrs: [s], extensionIds: [] };
	}
	return { peerId: validPeerId(s), addrs: [], extensionIds: [] };
}
