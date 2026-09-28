// SPDX-License-Identifier: MIT
// The provider: offers one extension on a libp2p node (ucep.md), with
// pairing, grants and scopes (ucep-auth.md).
//
//   const provider = createProvider({ libp2p, manifest, commands })
//   await provider.start()
//   const { uri } = await provider.createInvitation({ scopes: ['invoice:document:read'] })
//
// Every authorization decision uses the PeerId the secure channel
// authenticated (`connection.remotePeer`), never a message field.

import { pbStream } from '@libp2p/utils';

import { constantTimeEqual, fromHex, randomBytes, sha256, toBase64url, toHex } from './crypto.js';
import { verifyDidProof } from './did.js';
import { encodeInvitation } from './links.js';
import { ext } from './pb/messages.js';
import { LIMITS, TIMEOUTS, UCEP_VERSION, UcepError, isScope, protocolId } from './protocol.js';
import { memoryStore } from './store.js';
import {
	inBandTranscript,
	invitationTranscript,
	pairingProof,
	shortAuthString,
	transcriptHash
} from './transcript.js';

const IDEMPOTENT_MS = 24 * 3600 * 1000;
const PENDING_MS = 2 * 60 * 1000;
const MAX_FAILED_PAIRINGS = 5;
/** Idempotent results kept per consumer: the oldest go first. */
const MAX_DONE_PER_PEER = 256;

/**
 * @typedef {object} CommandContext
 * @property {string[]} args
 * @property {Record<string, unknown> | null} argsJson
 * @property {string} peerId the caller, authenticated
 * @property {Grant | null} grant
 * @property {string} requestId
 * @property {boolean} limited the connection is relayed and limited
 */

/**
 * @typedef {object} Command
 * @property {(ctx: CommandContext) => unknown | Promise<unknown>} handler returns JSON-serialisable data; throws UcepError for a known failure
 * @property {string} [scope] '' or absent: public
 * @property {string} [syntax]
 * @property {string} [description]
 * @property {boolean} [idempotent]
 * @property {object} [argsSchema] JSON Schema, published in the manifest
 * @property {object} [resultSchema]
 * @property {(argsJson: Record<string, unknown> | null, args: string[]) => boolean} [validate]
 */

/**
 * @typedef {object} Grant
 * @property {string} grantId
 * @property {string} extensionId
 * @property {string} consumerPeerId
 * @property {string[]} scopes
 * @property {string} label
 * @property {string} did '' when none was bound
 * @property {number} createdAt ms
 * @property {number} expiresAt ms, 0 = none
 * @property {number} lastUsedAt ms
 */

/**
 * @typedef {object} StoredInvitation
 * @property {string} invitationId
 * @property {string} secretHex
 * @property {number} expiresAt Unix seconds
 * @property {string[]} scopes
 * @property {number} failures
 * @property {'open' | 'pending' | 'used'} state
 * @property {string} [pendingPeer]
 * @property {string} [pendingSas]
 * @property {'approved' | 'denied'} [decision]
 * @property {string[]} [approvedScopes]
 */

/**
 * @typedef {object} PendingPairing what the provider's human is shown
 * @property {'invitation' | 'in-band'} mode
 * @property {string} id invitationId or pairingId
 * @property {string} peerId
 * @property {string} label
 * @property {string} did
 * @property {string[]} scopes
 * @property {string} sas six digits
 */

/**
 * @param {object} init
 * @param {import('@libp2p/interface').Libp2p} init.libp2p
 * @param {{ id: string, name: string, version: string, description?: string, author?: string, publicUrl?: string, icon?: string, scopes?: { name: string, description: string }[] }} init.manifest
 * @param {Record<string, Command>} init.commands
 * @param {('INVITATION' | 'IN_BAND')[]} [init.pairingModes]
 * @param {boolean} [init.confirmInvitations] a human confirms invitation pairings too (PENDING + SAS)
 * @param {{ grants?: import('./store.js').KeyValue<Grant>, invitations?: import('./store.js').KeyValue<StoredInvitation> }} [init.store]
 * @param {number} [init.grantLifetimeMs] 0: grants do not expire
 * @param {() => number} [init.now] ms
 */
export function createProvider({
	libp2p,
	manifest,
	commands,
	pairingModes = ['INVITATION', 'IN_BAND'],
	confirmInvitations = false,
	store = {},
	grantLifetimeMs = 0,
	now = () => Date.now()
}) {
	const protocol = protocolId(manifest.id, manifest.version);
	const scopes = manifest.scopes ?? [];
	for (const s of scopes) {
		if (!isScope(s.name, manifest.id)) throw new Error(`Scope ${s.name} is not of ${manifest.id}`);
	}
	for (const [name, c] of Object.entries(commands)) {
		if (c.scope && !scopes.some((s) => s.name === c.scope)) {
			throw new Error(`Command ${name} needs scope ${c.scope}, which the manifest does not list`);
		}
	}
	/** @type {import('./store.js').KeyValue<Grant>} */
	const grants = store.grants ?? memoryStore();
	/** @type {import('./store.js').KeyValue<StoredInvitation>} */
	const invitations = store.invitations ?? memoryStore();
	/** in-band pairings, by pairingId; never persisted (§11) */
	/** @type {Map<string, any>} */
	const inBand = new Map();
	/** peer → requestId → response, for idempotent commands */
	/** @type {Map<string, Map<string, { at: number, response: any }>>} */
	const done = new Map();
	/** peer|requestId → the answer being made: a retry waits for it */
	/** @type {Map<string, Promise<any>>} */
	const running = new Map();
	/** Grants revoked on this run: a command still running does not write them back. */
	const revoked = new Set();
	/** One pairing at a time per invitation, so it is used once. */
	/** @type {Map<string, Promise<unknown>>} */
	const locks = new Map();
	let windowUntil = 0;
	const events = new EventTarget();
	const self = () => libp2p.peerId.toString();

	/**
	 * Run `fn` after every earlier call under `key` has finished.
	 *
	 * @template T
	 * @param {string} key
	 * @param {() => Promise<T>} fn
	 * @returns {Promise<T>}
	 */
	function serialized(key, fn) {
		const before = locks.get(key) ?? Promise.resolve();
		const run = before.then(fn, fn);
		const tail = run.catch(() => {});
		locks.set(key, tail);
		tail.then(() => {
			if (locks.get(key) === tail) locks.delete(key);
		});
		return run;
	}

	/** @param {Grant} g */
	async function forget(g) {
		revoked.add(g.grantId);
		await grants.delete(g.grantId);
	}

	/** @param {string} type @param {unknown} detail */
	const emit = (type, detail) => events.dispatchEvent(new CustomEvent(type, { detail }));

	function manifestMessage() {
		return {
			id: manifest.id,
			name: manifest.name,
			version: manifest.version,
			description: manifest.description ?? '',
			author: manifest.author ?? '',
			publicUrl: manifest.publicUrl ?? '',
			icon: manifest.icon ?? '',
			commands: Object.entries(commands).map(([name, c]) => ({
				name,
				syntax: c.syntax ?? `/${manifest.id}-${name}`,
				description: c.description ?? '',
				scope: c.scope ?? '',
				argsSchema: c.argsSchema ? JSON.stringify(c.argsSchema) : '',
				resultSchema: c.resultSchema ? JSON.stringify(c.resultSchema) : '',
				idempotent: Boolean(c.idempotent)
			})),
			ucepVersion: UCEP_VERSION,
			pairingModes,
			scopes
		};
	}

	/** @param {string} peer */
	async function grantOf(peer) {
		return (await grants.values()).find(
			(g) => g.extensionId === manifest.id && g.consumerPeerId === peer
		);
	}

	/**
	 * @param {string} peer
	 * @param {string[]} granted
	 * @param {string} label
	 * @param {string} did
	 */
	async function grant(peer, granted, label, did) {
		const old = await grantOf(peer);
		if (old) await forget(old);
		const at = now();
		/** @type {Grant} */
		const g = {
			grantId: toBase64url(randomBytes(16)),
			extensionId: manifest.id,
			consumerPeerId: peer,
			scopes: granted,
			label: label.slice(0, 64),
			did,
			createdAt: at,
			expiresAt: grantLifetimeMs ? at + grantLifetimeMs : 0,
			lastUsedAt: at
		};
		await grants.set(g.grantId, g);
		emit('pairing:granted', g);
		return g;
	}

	/** @param {Grant} g */
	const granted = (g) => ({
		pair: {
			status: 'GRANTED',
			grantId: g.grantId,
			scopes: g.scopes,
			expiresAt: BigInt(g.expiresAt)
		}
	});
	/** @param {string} code @param {string} [error] */
	const denied = (code, error = '') => ({ pair: { status: 'DENIED', errorCode: code, error } });
	/** @param {Record<string, unknown>} [more] */
	const pending = (more = {}) => ({ pair: { status: 'PENDING', retryAfterMs: 1000n, ...more } });

	/** @param {any} req the PairRequest @param {string} peer */
	async function pairWithInvitation(req, peer) {
		const inv = await invitations.get(req.invitationId);
		if (!inv) return denied('INVITATION_UNKNOWN');
		if (inv.state === 'used') return denied('INVITATION_USED');
		if (inv.state === 'pending' && inv.pendingPeer !== peer) return denied('INVITATION_USED');
		if (Math.floor(now() / 1000) > inv.expiresAt) return denied('INVITATION_EXPIRED');
		if (!req.scopes.every((/** @type {string} */ s) => inv.scopes.includes(s))) {
			return denied('SCOPE_NOT_OFFERED');
		}
		const transcript = invitationTranscript({
			extensionId: manifest.id,
			invitationId: inv.invitationId,
			providerPeerId: self(),
			consumerPeerId: peer,
			scopes: req.scopes,
			did: req.did
		});
		const expected = await pairingProof(fromHex(inv.secretHex), transcript);
		/** A wrong proof or signature counts; enough of them use the invitation up. */
		const failed = async (/** @type {string} */ code) => {
			inv.failures += 1;
			if (inv.failures >= MAX_FAILED_PAIRINGS) Object.assign(inv, { state: 'used', secretHex: '' });
			await invitations.set(inv.invitationId, inv);
			return denied(code);
		};
		if (!constantTimeEqual(expected, req.proof ?? new Uint8Array())) {
			return failed('PAIRING_PROOF_INVALID');
		}
		const hash = await transcriptHash(transcript);
		if (req.did && !(await verifyDidProof(req.did, req.didProof ?? {}, hash))) {
			return failed('DID_SIGNATURE_INVALID');
		}
		if (confirmInvitations && inv.decision !== 'approved') {
			if (inv.decision === 'denied') {
				await invitations.set(inv.invitationId, { ...inv, state: 'used', secretHex: '' });
				return denied('PAIRING_DENIED');
			}
			if (inv.state !== 'pending') {
				inv.state = 'pending';
				inv.pendingPeer = peer;
				inv.pendingSas = shortAuthString(hash);
				await invitations.set(inv.invitationId, inv);
				emit('pairing:pending', {
					mode: 'invitation',
					id: inv.invitationId,
					peerId: peer,
					label: req.label,
					did: req.did,
					scopes: req.scopes,
					sas: inv.pendingSas
				});
			}
			return pending();
		}
		// The secret goes once the invitation is used (§11).
		await invitations.set(inv.invitationId, { ...inv, state: 'used', secretHex: '' });
		return granted(await grant(peer, inv.approvedScopes ?? req.scopes, req.label, req.did));
	}

	/** @param {any} req the PairRequest @param {string} peer */
	async function pairInBand(req, peer) {
		if (!pairingModes.includes('IN_BAND')) return denied('PAIRING_DISABLED');
		// Step 1: the commitment.
		if (!req.pairingId) {
			if (now() > windowUntil) return denied('PAIRING_DISABLED');
			if (!req.scopes.every((/** @type {string} */ s) => scopes.some((x) => x.name === s))) {
				return denied('SCOPE_NOT_OFFERED');
			}
			const live = [...inBand.values()].filter((p) => p.expiresAt > now());
			if (live.some((p) => p.peer === peer) || live.length >= 3) return denied('RATE_LIMITED');
			if (!(req.commitment instanceof Uint8Array) || req.commitment.length !== 32) {
				return denied('COMMITMENT_MISMATCH');
			}
			const p = {
				pairingId: toBase64url(randomBytes(16)),
				peer,
				commitment: req.commitment,
				nonceP: randomBytes(32),
				scopes: [...req.scopes],
				label: String(req.label ?? ''),
				expiresAt: now() + PENDING_MS,
				stage: 'committed'
			};
			inBand.set(p.pairingId, p);
			return pending({ pairingId: p.pairingId, nonce: p.nonceP });
		}
		// Step 2 and its retries: the reveal.
		const p = inBand.get(req.pairingId);
		if (!p || p.peer !== peer || p.expiresAt < now()) {
			inBand.delete(req.pairingId);
			return denied('PAIRING_UNKNOWN');
		}
		const same =
			req.nonce instanceof Uint8Array &&
			constantTimeEqual(await sha256(req.nonce), p.commitment) &&
			JSON.stringify(req.scopes) === JSON.stringify(p.scopes) &&
			String(req.label ?? '') === p.label;
		if (!same) {
			inBand.delete(req.pairingId);
			return denied('COMMITMENT_MISMATCH');
		}
		if (p.stage === 'committed') {
			const hash = await transcriptHash(
				inBandTranscript({
					extensionId: manifest.id,
					pairingId: p.pairingId,
					providerPeerId: self(),
					consumerPeerId: peer,
					scopes: p.scopes,
					did: req.did,
					nonceC: req.nonce,
					nonceP: p.nonceP
				})
			);
			if (req.did && !(await verifyDidProof(req.did, req.didProof ?? {}, hash))) {
				inBand.delete(req.pairingId);
				return denied('DID_SIGNATURE_INVALID');
			}
			p.stage = 'revealed';
			p.did = req.did ?? '';
			p.sas = shortAuthString(hash);
			emit('pairing:pending', {
				mode: 'in-band',
				id: p.pairingId,
				peerId: peer,
				label: p.label,
				did: p.did,
				scopes: p.scopes,
				sas: p.sas
			});
			return pending();
		}
		if (p.decision === 'denied') {
			inBand.delete(p.pairingId);
			return denied('PAIRING_DENIED');
		}
		if (p.decision === 'approved') {
			inBand.delete(p.pairingId);
			windowUntil = 0; // the window closes after the first grant (§5.2)
			return granted(await grant(peer, p.approvedScopes ?? p.scopes, p.label, p.did));
		}
		return pending();
	}

	/** @param {any} req the CommandRequest @param {import('@libp2p/interface').Connection} connection */
	async function command(req, connection) {
		const peer = connection.remotePeer.toString();
		/** @param {string} code @param {string} [error] */
		const fail = (code, error = '') => ({
			command: {
				requestId: req.requestId,
				success: false,
				errorCode: code,
				error,
				timestamp: BigInt(now())
			}
		});
		if (req.extensionId !== manifest.id) return fail('UNKNOWN_EXTENSION');
		const c = Object.hasOwn(commands, req.command) ? commands[req.command] : null;
		if (!c) return fail('UNKNOWN_COMMAND');
		if (!req.requestId || new TextEncoder().encode(req.requestId).length > LIMITS.requestId) {
			return fail('INVALID_ARGUMENTS', 'requestId');
		}
		let g = null;
		if (c.scope) {
			g = await grantOf(peer);
			if (!g) return fail('PAIRING_REQUIRED');
			if (g.expiresAt && g.expiresAt < now()) return fail('GRANT_EXPIRED');
			if (!g.scopes.includes(c.scope)) return fail('SCOPE_MISSING');
		}
		if (!c.idempotent) return run(req, c, g, connection, fail);
		const key = `${peer}|${req.requestId}`;
		const earlier = done.get(peer)?.get(req.requestId);
		if (earlier && earlier.at > now() - IDEMPOTENT_MS) return earlier.response;
		// The same request while the first still runs: its answer, not a second run.
		const inFlight = running.get(key);
		if (inFlight) return inFlight;
		const answer = run(req, c, g, connection, fail);
		running.set(key, answer);
		try {
			const response = await answer;
			if (response.command.success) keep(peer, req.requestId, response);
			return response;
		} finally {
			running.delete(key);
		}
	}

	/**
	 * @param {string} peer @param {string} requestId @param {any} response
	 */
	function keep(peer, requestId, response) {
		const at = now();
		for (const [p, results] of done) {
			for (const [id, v] of results) if (v.at < at - IDEMPOTENT_MS) results.delete(id);
			if (!results.size) done.delete(p);
		}
		let mine = done.get(peer);
		if (!mine) done.set(peer, (mine = new Map()));
		mine.delete(requestId);
		mine.set(requestId, { at, response });
		while (mine.size > MAX_DONE_PER_PEER)
			mine.delete(/** @type {string} */ (mine.keys().next().value));
	}

	/**
	 * @param {any} req @param {Command} c @param {Grant | null} g
	 * @param {import('@libp2p/interface').Connection} connection
	 * @param {(code: string, error?: string) => any} fail
	 */
	async function run(req, c, g, connection, fail) {
		const peer = connection.remotePeer.toString();

		/** @type {Record<string, unknown> | null} */
		let argsJson = null;
		if (req.argsJson != null) {
			if (req.args.length) return fail('INVALID_ARGUMENTS', 'args and argsJson');
			try {
				argsJson = JSON.parse(req.argsJson);
			} catch {
				return fail('INVALID_ARGUMENTS', 'argsJson is no JSON');
			}
			if (!argsJson || typeof argsJson !== 'object' || Array.isArray(argsJson)) {
				return fail('INVALID_ARGUMENTS', 'argsJson is no object');
			}
		}
		if (c.validate && !c.validate(argsJson, req.args)) return fail('INVALID_ARGUMENTS');

		const limited = connection.limits != null;
		let data;
		try {
			data = await c.handler({
				args: req.args,
				argsJson,
				peerId: peer,
				grant: g,
				requestId: req.requestId,
				limited
			});
		} catch (error) {
			if (error instanceof UcepError) return fail(error.code, error.message);
			return fail('INTERNAL');
		}
		const text = data === undefined ? undefined : JSON.stringify(data);
		const max = limited ? LIMITS.limitedResponse : LIMITS.response;
		if (text !== undefined && new TextEncoder().encode(text).length > max - 256) {
			return fail('TOO_LARGE', limited ? 'open a direct connection first' : '');
		}
		if (g) await touch(g.grantId);
		return {
			command: { requestId: req.requestId, success: true, data: text, timestamp: BigInt(now()) }
		};
	}

	/**
	 * Note when a grant was last used — unless it was revoked meanwhile (while
	 * the command ran, or while this very write ran): a revoked grant stays so.
	 *
	 * @param {string} grantId
	 */
	async function touch(grantId) {
		if (revoked.has(grantId)) return;
		const current = await grants.get(grantId);
		if (!current || revoked.has(grantId)) return;
		await grants.set(grantId, { ...current, lastUsedAt: now() });
		if (revoked.has(grantId)) await grants.delete(grantId);
	}

	/** @param {any} req @param {import('@libp2p/interface').Connection} connection */
	async function respond(req, connection) {
		const peer = connection.remotePeer.toString();
		if (req.manifest)
			return { manifest: { manifest: manifestMessage(), timestamp: BigInt(now()) } };
		if (req.command) return command(req.command, connection);
		if (req.pair) {
			if (req.pair.extensionId !== manifest.id) return denied('UNKNOWN_EXTENSION');
			if (req.pair.invitationId) {
				if (!pairingModes.includes('INVITATION')) return denied('PAIRING_DISABLED');
				const id = String(req.pair.invitationId);
				return serialized(`invitation|${id}`, () => pairWithInvitation(req.pair, peer));
			}
			return pairInBand(req.pair, peer);
		}
		if (req.unpair) {
			const g = await grants.get(req.unpair.grantId);
			if (!g || g.consumerPeerId !== peer) {
				return { unpair: { success: false, errorCode: 'INVALID_ARGUMENTS' } };
			}
			await forget(g);
			emit('grant:revoked', g);
			return { unpair: { success: true } };
		}
		return null;
	}

	/**
	 * @param {import('@libp2p/interface').Stream} stream
	 * @param {import('@libp2p/interface').Connection} connection
	 */
	async function handle(stream, connection) {
		const pb = pbStream(stream, { maxDataLength: LIMITS.request });
		let req;
		try {
			req = await pb.read(ext.Request, { signal: AbortSignal.timeout(TIMEOUTS.read) });
		} catch {
			stream.abort(new Error('unreadable request'));
			return;
		}
		try {
			const res = await respond(req, connection);
			if (!res) {
				stream.abort(new Error('empty request'));
				return;
			}
			await pb.write(res, ext.Response, { signal: AbortSignal.timeout(TIMEOUTS.answer) });
			await stream.close();
		} catch (error) {
			stream.abort(error instanceof Error ? error : new Error(String(error)));
		}
	}

	return {
		protocol,
		events,

		async start() {
			await libp2p.handle(protocol, handle, { runOnLimitedConnection: true, maxInboundStreams: 8 });
		},

		async stop() {
			await libp2p.unhandle(protocol);
		},

		/**
		 * An invitation to show as a QR code or to copy (ucep-auth.md §3).
		 *
		 * @param {{ scopes: string[], ttlSeconds?: number, addrs?: string[] }} options
		 */
		async createInvitation({ scopes: offered, ttlSeconds = 600, addrs }) {
			if (!pairingModes.includes('INVITATION')) throw new Error('Invitations are not offered');
			if (!offered.length || !offered.every((s) => scopes.some((x) => x.name === s))) {
				throw new Error('Offer only scopes the manifest lists');
			}
			const secret = randomBytes(32);
			const invitationId = toBase64url(randomBytes(16));
			const expiresAt = Math.floor(now() / 1000) + ttlSeconds;
			await invitations.set(invitationId, {
				invitationId,
				secretHex: toHex(secret),
				expiresAt,
				scopes: offered,
				failures: 0,
				state: 'open'
			});
			const listen =
				addrs ??
				libp2p
					.getMultiaddrs()
					.map((a) => a.toString())
					.filter((a) => a.endsWith(`/p2p/${self()}`));
			const invitation = {
				providerPeerId: self(),
				extensionId: manifest.id,
				invitationId,
				secret,
				expiresAt,
				scopes: offered,
				addrs: listen
			};
			return { invitationId, expiresAt, uri: encodeInvitation(invitation) };
		},

		/** @param {string} invitationId */
		async cancelInvitation(invitationId) {
			await invitations.delete(invitationId);
		},

		/** Accept in-band requests for a while (§5.2). @param {number} [ms] */
		openPairingWindow(ms = PENDING_MS) {
			windowUntil = now() + ms;
		},

		closePairingWindow() {
			windowUntil = 0;
		},

		/**
		 * Approve a pending pairing. `code` is what the human typed: it must be
		 * the SAS the consumer shows (§5.2). Without it nothing is approved, so
		 * an app cannot skip the comparison by mistake.
		 *
		 * @param {string} id pairingId or invitationId
		 * @param {{ code: string, scopes?: string[] }} options
		 */
		async approve(id, { code, scopes: fewer } = /** @type {any} */ ({})) {
			const p = inBand.get(id);
			const inv = p ? null : await invitations.get(id);
			const sas = p ? p.sas : inv?.pendingSas;
			const offered = p ? p.scopes : (inv?.scopes ?? []);
			if (!sas) throw new Error('No pairing waits for approval under this id');
			if (typeof code !== 'string' || !code)
				throw new Error('Approve with the code the other app shows');
			if (!constantTimeEqual(new TextEncoder().encode(code), new TextEncoder().encode(sas)))
				throw new UcepError('PAIRING_DENIED', 'The codes differ');
			if (fewer && !fewer.every((s) => offered.includes(s)))
				throw new Error('More scopes than asked');
			// No undefined field: a store may encode what it keeps (dag-cbor has no undefined).
			const decision = { decision: 'approved', ...(fewer ? { approvedScopes: fewer } : {}) };
			if (p) Object.assign(p, decision);
			else if (inv) await invitations.set(id, { ...inv, ...decision });
		},

		/** @param {string} id */
		async deny(id) {
			const p = inBand.get(id);
			if (p) p.decision = 'denied';
			else {
				const inv = await invitations.get(id);
				if (inv) await invitations.set(id, { ...inv, decision: 'denied' });
			}
		},

		/** @returns {Promise<Grant[]>} */
		async grants() {
			return (await grants.values()).filter((g) => g.extensionId === manifest.id);
		},

		/** @param {string} grantId */
		async revoke(grantId) {
			const g = await grants.get(grantId);
			if (g) {
				await forget(g);
				emit('grant:revoked', g);
			}
		}
	};
}
