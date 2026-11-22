// SPDX-License-Identifier: MIT
// The consumer: discovers extensions through identify, keeps a catalogue
// with online status, calls commands, and pairs (ucep.md §4, §7;
// ucep-auth.md §5).
//
//   const consumer = createConsumer({ libp2p, label: 'Belege, Laptop' })
//   await consumer.start()
//   await consumer.pairWithInvitation(scannedText)
//   const result = await consumer.call(providerPeerId, 'invoice', 'status', { documentId })

import { peerIdFromString } from '@libp2p/peer-id';
import { multiaddr } from '@multiformats/multiaddr';
import { pbStream } from '@libp2p/utils';

import { randomBytes, sha256, toBase64url } from './crypto.js';
import { parseInvitation, parseProviderInput } from './links.js';
import { ext } from './pb/messages.js';
import {
	LIMITS,
	TIMEOUTS,
	UCEP_VERSION,
	UcepError,
	compatible,
	isLimited,
	ownLimits,
	parseProtocolId,
	statedLimits
} from './protocol.js';
import { memoryStore } from './store.js';
import {
	inBandTranscript,
	invitationTranscript,
	pairingProof,
	shortAuthString,
	transcriptHash
} from './transcript.js';

const CHECK_INTERVAL_MS = 60_000;
/**
 * How often a new connection is tried to a peer reached only through a relay:
 * the try may come back direct (WebRTC), which a relayed one never is, but
 * libp2p opens a new relayed connection for every dial otherwise.
 */
const UPGRADE_INTERVAL_MS = 60_000;

/**
 * @typedef {object} CatalogueEntry one extension on one provider (ucep.md §4.1)
 * @property {string} peerId
 * @property {string} protocol
 * @property {string} extensionId
 * @property {string} version
 * @property {any | null} manifest
 * @property {'online' | 'withdrawn' | 'offline' | 'unknown'} status
 * @property {number} firstSeen
 * @property {number} lastSeen
 */

/**
 * @typedef {object} ConsumerGrant what the consumer keeps of a pairing
 * @property {string} providerPeerId
 * @property {string} extensionId
 * @property {string} grantId
 * @property {string[]} scopes
 * @property {number} expiresAt
 */

/**
 * @param {object} init
 * @param {import('@libp2p/interface').Libp2p} init.libp2p
 * @param {string} [init.label] shown to the provider's human, e.g. "Belege, Laptop"
 * @param {string} [init.did] bind this DID to pairings (ucep-auth.md §9)
 * @param {(transcriptHash: Uint8Array) => Promise<import('./did.js').DidProof>} [init.signDid] proves `did`
 * @param {{ grants?: import('./store.js').KeyValue<ConsumerGrant>, catalogue?: import('./store.js').KeyValue<CatalogueEntry> }} [init.store]
 * @param {() => number} [init.now]
 * @param {Partial<import('./protocol.js').MessageLimits>} [init.limits] the most this consumer
 *   sends and reads; a call uses min(these, what the provider's manifest states), and the
 *   defaults of ucep.md §11 where it states none (§11.1). Without it: the defaults.
 */
export function createConsumer({
	libp2p,
	label = '',
	did = '',
	signDid,
	store = {},
	now = () => Date.now(),
	limits: wanted
}) {
	const own = ownLimits(wanted);
	/** @type {import('./store.js').KeyValue<ConsumerGrant>} */
	const grants = store.grants ?? memoryStore();
	/** @type {import('./store.js').KeyValue<CatalogueEntry>} */
	const catalogue = store.catalogue ?? memoryStore();
	/** @type {Map<string, number>} last online check per peer */
	const checked = new Map();
	/** @type {Map<string, number>} when a new connection was last tried, per peer */
	const upgradeTried = new Map();
	const events = new EventTarget();
	const changed = () => events.dispatchEvent(new CustomEvent('catalogue:change'));
	const key = (/** @type {string} */ peer, /** @type {string} */ protocol) => `${peer}|${protocol}`;
	const grantKey = (/** @type {string} */ peer, /** @type {string} */ id) => `${peer}|${id}`;

	/**
	 * An open connection to the peer, a direct one first; null when there is none.
	 *
	 * @param {import('@libp2p/interface').PeerId} id
	 * @returns {import('@libp2p/interface').Connection | null}
	 */
	function openConnection(id) {
		const open = libp2p.getConnections(id).filter((c) => c.status === 'open');
		return open.find((c) => c.limits == null) ?? open[0] ?? null;
	}

	/**
	 * An open connection to reuse, or null to dial.
	 *
	 * A direct connection is always reused. A relayed (limited) one is too,
	 * except at most once a minute per peer, when libp2p is left to dial: that
	 * dial may come back direct. Without this, libp2p opens a new relayed
	 * connection for every call while the only one is limited, and the
	 * provider refuses them once more than five a second arrive from the
	 * relay's address (libp2p's inbound threshold).
	 *
	 * @param {import('@libp2p/interface').PeerId} id
	 * @returns {import('@libp2p/interface').Connection | null}
	 */
	function reusable(id) {
		const open = libp2p.getConnections(id).filter((c) => c.status === 'open');
		const direct = open.find((c) => c.limits == null);
		if (direct) return direct;
		if (!open.length) return null;
		const peer = id.toString();
		if (now() - (upgradeTried.get(peer) ?? 0) >= UPGRADE_INTERVAL_MS) {
			upgradeTried.set(peer, now());
			return null;
		}
		return open[0];
	}

	/**
	 * One request, one response (ucep.md §5).
	 *
	 * @param {string | import('@libp2p/interface').PeerId} peer
	 * @param {string} protocol
	 * @param {any} request
	 * @param {{ signal?: AbortSignal, addrs?: string[], limits?: import('./protocol.js').MessageLimits }} [options]
	 *   `limits`: what this exchange may send and read off a limited connection; without it the defaults
	 */
	async function exchange(peer, protocol, request, { signal, addrs = [], limits } = {}) {
		const id = typeof peer === 'string' ? peerIdFromString(peer) : peer;
		const allowed = limits ?? { request: LIMITS.request, response: own.response };
		// Too large is said here, before anything is sent: a provider would
		// only reset the stream (ucep.md §11.1).
		const size = ext.Request.encode(request).length;
		if (size > allowed.request) {
			throw new UcepError('TOO_LARGE', `request of ${size} bytes, at most ${allowed.request}`, {
				limit: allowed.request
			});
		}
		const s = signal ?? AbortSignal.timeout(TIMEOUTS.answer);
		const target = addrs.length ? addrs.map((a) => multiaddr(a)) : id;
		const existing = reusable(id);
		const stream =
			(existing &&
				(await existing
					.newStream(protocol, { runOnLimitedConnection: true, signal: s })
					.catch(() => null))) ||
			(await libp2p
				.dialProtocol(target, protocol, { runOnLimitedConnection: true, signal: s })
				.catch(async (/** @type {unknown} */ error) => {
					// The dial that might have come back direct did not (a WebRTC
					// upgrade that stalled, then libp2p refusing a second connection
					// to the same relayed address): the one that is open carries it.
					const open = s.aborted ? null : openConnection(id);
					if (!open) throw error;
					return open.newStream(protocol, { runOnLimitedConnection: true, signal: s });
				}));
		// On a limited connection the stated limits do not hold: 64 KiB both ways.
		const via = libp2p.getConnections(id).find((c) => c.streams?.includes(stream));
		if (size > LIMITS.request && isLimited(via)) {
			stream.abort(new Error('request too large for a limited connection'));
			throw new UcepError('TOO_LARGE', 'open a direct connection first', {
				limit: LIMITS.request
			});
		}
		try {
			const pb = pbStream(stream, { maxDataLength: allowed.response });
			await pb.write(request, ext.Request, { signal: s });
			const response = await pb.read(ext.Response, { signal: s });
			await stream.close({ signal: s }).catch(() => {});
			return response;
		} catch (error) {
			stream.abort(error instanceof Error ? error : new Error(String(error)));
			const name = /** @type {any} */ (error)?.name;
			if (name === 'InvalidDataLengthError' || name === 'InvalidDataLengthLengthError') {
				throw new UcepError('TOO_LARGE', `answer longer than ${allowed.response} bytes`, {
					limit: allowed.response
				});
			}
			throw error;
		}
	}

	/** @param {string} peer @param {string[]} protocols */
	async function seen(peer, protocols) {
		const offered = new Set(protocols.filter((p) => parseProtocolId(p)));
		let any = false;
		for (const entry of await catalogue.values()) {
			if (entry.peerId !== peer) continue;
			const status = offered.has(entry.protocol) ? 'online' : 'withdrawn';
			if (entry.status !== status) {
				await catalogue.set(key(peer, entry.protocol), {
					...entry,
					status,
					lastSeen: status === 'online' ? now() : entry.lastSeen
				});
				any = true;
			}
			offered.delete(entry.protocol);
		}
		for (const protocol of offered) {
			const p = /** @type {NonNullable<ReturnType<typeof parseProtocolId>>} */ (
				parseProtocolId(protocol)
			);
			/** @type {CatalogueEntry} */
			const entry = {
				peerId: peer,
				protocol,
				extensionId: p.extensionId,
				version: p.version,
				manifest: null,
				status: 'online',
				firstSeen: now(),
				lastSeen: now()
			};
			await catalogue.set(key(peer, protocol), entry);
			any = true;
			// The manifest describes; it never instructs (§4).
			fetchManifest(peer, protocol).catch(() => {});
		}
		if (any) changed();
	}

	/** @param {string} peer */
	async function gone(peer) {
		let any = false;
		for (const entry of await catalogue.values()) {
			if (entry.peerId === peer && entry.status === 'online') {
				await catalogue.set(key(peer, entry.protocol), { ...entry, status: 'offline' });
				any = true;
			}
		}
		if (any) changed();
	}

	/** @param {CustomEvent<import('@libp2p/interface').IdentifyResult>} evt */
	const onIdentify = (evt) => void seen(evt.detail.peerId.toString(), evt.detail.protocols);
	/** @param {CustomEvent<import('@libp2p/interface').PeerUpdate>} evt */
	const onUpdate = (evt) => {
		const peer = evt.detail.peer;
		if (libp2p.getConnections(peer.id).length) void seen(peer.id.toString(), peer.protocols);
	};
	/** @param {CustomEvent<import('@libp2p/interface').PeerId>} evt */
	const onDisconnect = (evt) => void gone(evt.detail.toString());

	/**
	 * @param {string} peer
	 * @param {string} protocol
	 */
	async function fetchManifest(peer, protocol) {
		const res = await exchange(peer, protocol, { manifest: { timestamp: BigInt(now()) } });
		const manifest = res.manifest?.manifest;
		if (!manifest) throw new UcepError('INTERNAL', 'no manifest');
		const entry = await catalogue.get(key(peer, protocol));
		if (entry) {
			await catalogue.set(key(peer, protocol), { ...entry, manifest, lastSeen: now() });
			changed();
		}
		return manifest;
	}

	/**
	 * The protocol of an extension on a peer, from the catalogue.
	 *
	 * @param {string} peer
	 * @param {string} extensionId
	 * @param {string} [wanted] the version the consumer needs
	 */
	async function protocolOf(peer, extensionId, wanted) {
		const entries = (await catalogue.values()).filter(
			(e) =>
				e.peerId === peer &&
				e.extensionId === extensionId &&
				e.status !== 'withdrawn' &&
				(!wanted || compatible(e.version, wanted))
		);
		const best = entries.sort((a, b) => (a.version < b.version ? 1 : -1))[0];
		if (!best) throw new UcepError('UNKNOWN_EXTENSION', `${peer} does not serve ${extensionId}`);
		return best.protocol;
	}

	/**
	 * What a call to this protocol may send and read off a limited connection:
	 * min(own, the manifest's stated limits), the defaults where it states none
	 * or is not known (ucep.md §11.1).
	 *
	 * @param {string} peer
	 * @param {string} protocol
	 * @param {{ fetch?: boolean, refresh?: boolean }} [options] `fetch`: ask for the manifest
	 *   when the catalogue has none; `refresh`: ask for it anyway
	 * @returns {Promise<import('./protocol.js').MessageLimits>}
	 */
	async function limitsOf(peer, protocol, { fetch = false, refresh = false } = {}) {
		let manifest = refresh ? null : ((await catalogue.get(key(peer, protocol)))?.manifest ?? null);
		if (!manifest && (fetch || refresh)) {
			manifest = await fetchManifest(peer, protocol).catch(() => null);
		}
		const stated = statedLimits(manifest);
		return {
			request: Math.min(own.request, stated.request),
			response: Math.min(own.response, stated.response)
		};
	}

	/** @param {any} res */
	function pairResult(res) {
		const p = res.pair;
		if (!p) throw new UcepError('INTERNAL', 'no pairing answer');
		return p;
	}

	/**
	 * @param {string} peer
	 * @param {string} extensionId
	 * @param {any} p the GRANTED PairResponse
	 */
	async function keepGrant(peer, extensionId, p) {
		/** @type {ConsumerGrant} */
		const g = {
			providerPeerId: peer,
			extensionId,
			grantId: p.grantId,
			scopes: p.scopes,
			expiresAt: Number(p.expiresAt ?? 0n)
		};
		await grants.set(grantKey(peer, extensionId), g);
		return g;
	}

	/** @param {number} ms */
	const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	/**
	 * Dial a peer and wait until identify has told its protocols.
	 *
	 * @param {string} peer
	 * @param {string[]} addrs
	 * @returns {Promise<{ connection: import('@libp2p/interface').Connection, protocols: string[] }>}
	 */
	async function dialIdentified(peer, addrs) {
		const id = peerIdFromString(peer);
		/** @type {(protocols: string[]) => void} */
		let resolve = () => {};
		/** @type {Promise<string[]>} */
		const identified = new Promise((r) => (resolve = r));
		/** @param {CustomEvent<import('@libp2p/interface').IdentifyResult>} evt */
		const listener = (evt) => {
			if (evt.detail.peerId.equals(id)) resolve(evt.detail.protocols);
		};
		libp2p.addEventListener('peer:identify', listener);
		try {
			const connection =
				reusable(id) ??
				(await libp2p
					.dial(addrs.length ? addrs.map((a) => multiaddr(a)) : id, {
						signal: AbortSignal.timeout(TIMEOUTS.online)
					})
					.catch((/** @type {unknown} */ error) => {
						// An invitation names the provider's WebRTC address through
						// the relay beside the relayed one. When WebRTC does not come
						// up, libp2p goes on to the relayed address – and refuses it,
						// since the relayed connection WebRTC was signalled over is
						// already open to it. That one serves.
						const open = openConnection(id);
						if (!open) throw error;
						return open;
					}));
			// What the peer store knows counts only once it names an extension:
			// libp2p records `/ipfs/id/1.0.0` as soon as it opens the identify
			// stream, long before identify has answered. Over a relay with real
			// latency, reading that meant UNKNOWN_EXTENSION for a provider that
			// serves the extension.
			const known = await libp2p.peerStore.get(id).catch(() => null);
			const protocols = known?.protocols.some((p) => parseProtocolId(p))
				? known.protocols
				: await Promise.race([
						identified,
						wait(TIMEOUTS.online).then(
							async () => (await libp2p.peerStore.get(id).catch(() => null))?.protocols ?? []
						)
					]);
			await seen(peer, protocols);
			return { connection, protocols };
		} finally {
			libp2p.removeEventListener('peer:identify', listener);
		}
	}

	return {
		events,

		async start() {
			libp2p.addEventListener('peer:identify', onIdentify);
			libp2p.addEventListener('peer:update', onUpdate);
			libp2p.addEventListener('peer:disconnect', onDisconnect);
			// Peers identified before we listened (§4, step 1).
			for (const connection of libp2p.getConnections()) {
				const peer = await libp2p.peerStore.get(connection.remotePeer).catch(() => null);
				if (peer) await seen(peer.id.toString(), peer.protocols);
			}
		},

		async stop() {
			libp2p.removeEventListener('peer:identify', onIdentify);
			libp2p.removeEventListener('peer:update', onUpdate);
			libp2p.removeEventListener('peer:disconnect', onDisconnect);
		},

		/** @returns {Promise<CatalogueEntry[]>} */
		catalogue: () => catalogue.values(),

		fetchManifest,

		/** The most this consumer sends and reads, its `limits` option. */
		limits: Object.freeze({ ...own }),

		/**
		 * What a call of the extension on the peer may send and read, off a
		 * limited connection: min(own, the provider's stated limits), the
		 * defaults where it states none. On a limited connection 64 KiB holds.
		 *
		 * @param {string} peer
		 * @param {string} extensionId
		 * @param {{ version?: string, fetch?: boolean }} [options] `fetch`: ask for the manifest when it is not known yet
		 */
		async limitsFor(peer, extensionId, { version, fetch = true } = {}) {
			return limitsOf(peer, await protocolOf(peer, extensionId, version), { fetch });
		},

		/**
		 * "Add by PeerId or link" (ucep.md §4.2): dial, identify, list what the
		 * provider serves. Nothing is installed or paired.
		 *
		 * @param {string} text a PeerId, a multiaddr or a provider link
		 */
		async addProvider(text) {
			const { peerId, addrs, extensionIds } = parseProviderInput(text);
			try {
				await dialIdentified(peerId, addrs);
			} catch {
				return { peerId, reachable: false, extensions: [] };
			}
			const extensions = (await catalogue.values()).filter(
				(e) => e.peerId === peerId && (!extensionIds.length || extensionIds.includes(e.extensionId))
			);
			return { peerId, reachable: true, extensions };
		},

		/**
		 * Is the provider online now? Dials and asks for the manifest; at most
		 * once a minute per peer (ucep.md §4.1).
		 *
		 * @param {string} peer
		 * @param {string} protocol
		 */
		async check(peer, protocol) {
			const last = checked.get(peer) ?? 0;
			const entry = await catalogue.get(key(peer, protocol));
			if (now() - last < CHECK_INTERVAL_MS) return entry?.status ?? 'unknown';
			checked.set(peer, now());
			try {
				await exchange(
					peer,
					protocol,
					{ manifest: { timestamp: BigInt(now()) } },
					{
						signal: AbortSignal.timeout(TIMEOUTS.online)
					}
				);
				if (entry)
					await catalogue.set(key(peer, protocol), { ...entry, status: 'online', lastSeen: now() });
				changed();
				return 'online';
			} catch {
				if (entry) await catalogue.set(key(peer, protocol), { ...entry, status: 'offline' });
				changed();
				return 'offline';
			}
		},

		/**
		 * Call a command. Arguments as an object go as argsJson, as an array as
		 * 0.1-style args. Throws UcepError with the provider's code.
		 *
		 * @param {string} peer
		 * @param {string} extensionId
		 * @param {string} command
		 * @param {Record<string, unknown> | string[]} [args]
		 * @param {{ requestId?: string, version?: string, signal?: AbortSignal }} [options]
		 *   `signal`: how long this call may take; without it TIMEOUTS.answer
		 */
		async call(peer, extensionId, command, args = {}, { requestId, version, signal } = {}) {
			const protocol = await protocolOf(peer, extensionId, version);
			const id = requestId ?? toBase64url(randomBytes(16));
			const request = {
				command: {
					requestId: id,
					extensionId,
					command,
					args: Array.isArray(args) ? args : [],
					argsJson: Array.isArray(args) ? undefined : JSON.stringify(args),
					timestamp: BigInt(now())
				}
			};
			// The limits come from the catalogue's manifest. It is asked for when
			// the catalogue has none and the consumer would read more than the
			// default, and again when the request needs more than the copy allows
			// and the consumer would send more: the provider may have raised them.
			const size = ext.Request.encode(request).length;
			let limits = await limitsOf(peer, protocol, { fetch: own.response > LIMITS.response });
			if (size > limits.request && own.request > limits.request) {
				limits = await limitsOf(peer, protocol, { refresh: true });
			}
			const res = await exchange(peer, protocol, request, {
				limits,
				...(signal ? { signal } : {})
			});
			const c = res.command;
			if (!c || c.requestId !== id) throw new UcepError('INTERNAL', 'answer to another request');
			if (!c.success) {
				const code = c.errorCode && c.errorCode !== 'ERROR_UNSPECIFIED' ? c.errorCode : 'INTERNAL';
				throw new UcepError(code, c.error || code);
			}
			return c.data === undefined ? undefined : JSON.parse(c.data);
		},

		/**
		 * Pair with an invitation (ucep-auth.md §5.1). `onCode` gets the SAS when
		 * the provider's human confirms.
		 *
		 * @param {string} text the invitation URI or link
		 * @param {{ scopes?: string[], onCode?: (sas: string) => void, timeoutMs?: number }} [options]
		 */
		async pairWithInvitation(text, { scopes, onCode, timeoutMs = 120_000 } = {}) {
			const inv = parseInvitation(text);
			if (Math.floor(now() / 1000) > inv.expiresAt) throw new UcepError('INVITATION_EXPIRED');
			const requested = scopes ?? inv.scopes;
			const { connection, protocols } = await dialIdentified(inv.providerPeerId, inv.addrs);
			// Only the peer the invitation names (§5.1, step 2).
			if (connection.remotePeer.toString() !== inv.providerPeerId) {
				throw new UcepError('PAIRING_PROOF_INVALID', 'another peer answered');
			}
			const peer = inv.providerPeerId;
			const protocol = protocols.find((p) => parseProtocolId(p)?.extensionId === inv.extensionId);
			if (!protocol) throw new UcepError('UNKNOWN_EXTENSION');
			const manifest = await fetchManifest(peer, protocol).catch(() => null);
			if (
				manifest &&
				(manifest.ucepVersion < UCEP_VERSION || !manifest.pairingModes.includes('INVITATION'))
			) {
				throw new UcepError('PAIRING_DISABLED');
			}
			const transcript = invitationTranscript({
				extensionId: inv.extensionId,
				invitationId: inv.invitationId,
				providerPeerId: peer,
				consumerPeerId: libp2p.peerId.toString(),
				scopes: requested,
				did
			});
			const hash = await transcriptHash(transcript);
			const request = {
				pair: {
					extensionId: inv.extensionId,
					invitationId: inv.invitationId,
					scopes: requested,
					proof: await pairingProof(inv.secret, transcript),
					label,
					did,
					didProof: did && signDid ? await signDid(hash) : undefined,
					timestamp: BigInt(now())
				}
			};
			const until = now() + timeoutMs;
			let told = false;
			for (;;) {
				const p = pairResult(await exchange(peer, protocol, request));
				if (p.status === 'GRANTED') return keepGrant(peer, inv.extensionId, p);
				if (p.status !== 'PENDING') throw new UcepError(p.errorCode || 'PAIRING_DENIED', p.error);
				if (!told) onCode?.(shortAuthString(hash));
				told = true;
				if (now() > until) throw new UcepError('PAIRING_UNKNOWN', 'no answer in time');
				await wait(Number(p.retryAfterMs || 1000n));
			}
		},

		/**
		 * Pair in-band (ucep-auth.md §5.2). Show the code `onCode` receives,
		 * large; the provider's human compares or types it.
		 *
		 * @param {string} peer
		 * @param {string} extensionId
		 * @param {{ scopes: string[], onCode: (sas: string) => void, timeoutMs?: number }} options
		 */
		async pairInBand(peer, extensionId, { scopes, onCode, timeoutMs = 120_000 }) {
			const protocol = await protocolOf(peer, extensionId);
			const nonceC = randomBytes(32);
			const first = pairResult(
				await exchange(peer, protocol, {
					pair: {
						extensionId,
						scopes,
						label,
						commitment: await sha256(nonceC),
						timestamp: BigInt(now())
					}
				})
			);
			if (first.status !== 'PENDING' || !first.pairingId || !first.nonce?.length) {
				throw new UcepError(first.errorCode || 'PAIRING_DENIED', first.error);
			}
			const hash = await transcriptHash(
				inBandTranscript({
					extensionId,
					pairingId: first.pairingId,
					providerPeerId: peer,
					consumerPeerId: libp2p.peerId.toString(),
					scopes,
					did,
					nonceC,
					nonceP: first.nonce
				})
			);
			const reveal = {
				pair: {
					extensionId,
					pairingId: first.pairingId,
					scopes,
					label,
					nonce: nonceC,
					did,
					didProof: did && signDid ? await signDid(hash) : undefined,
					timestamp: BigInt(now())
				}
			};
			onCode(shortAuthString(hash));
			const until = now() + timeoutMs;
			for (;;) {
				const p = pairResult(await exchange(peer, protocol, reveal));
				if (p.status === 'GRANTED') return keepGrant(peer, extensionId, p);
				if (p.status !== 'PENDING') throw new UcepError(p.errorCode || 'PAIRING_DENIED', p.error);
				if (now() > until) throw new UcepError('PAIRING_UNKNOWN', 'no answer in time');
				await wait(Number(p.retryAfterMs || 1000n));
			}
		},

		/** @param {string} peer @param {string} extensionId */
		async unpair(peer, extensionId) {
			const g = await grants.get(grantKey(peer, extensionId));
			if (!g) return false;
			const protocol = await protocolOf(peer, extensionId);
			const res = await exchange(peer, protocol, {
				unpair: { grantId: g.grantId, timestamp: BigInt(now()) }
			});
			await grants.delete(grantKey(peer, extensionId));
			return Boolean(res.unpair?.success);
		},

		/** @returns {Promise<ConsumerGrant[]>} */
		grants: () => grants.values()
	};
}
