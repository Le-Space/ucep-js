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
	parseProtocolId
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
 */
export function createConsumer({
	libp2p,
	label = '',
	did = '',
	signDid,
	store = {},
	now = () => Date.now()
}) {
	/** @type {import('./store.js').KeyValue<ConsumerGrant>} */
	const grants = store.grants ?? memoryStore();
	/** @type {import('./store.js').KeyValue<CatalogueEntry>} */
	const catalogue = store.catalogue ?? memoryStore();
	/** @type {Map<string, number>} last online check per peer */
	const checked = new Map();
	const events = new EventTarget();
	const changed = () => events.dispatchEvent(new CustomEvent('catalogue:change'));
	const key = (/** @type {string} */ peer, /** @type {string} */ protocol) => `${peer}|${protocol}`;
	const grantKey = (/** @type {string} */ peer, /** @type {string} */ id) => `${peer}|${id}`;

	/**
	 * One request, one response (ucep.md §5).
	 *
	 * @param {string | import('@libp2p/interface').PeerId} peer
	 * @param {string} protocol
	 * @param {any} request
	 * @param {{ signal?: AbortSignal, addrs?: string[] }} [options]
	 */
	async function exchange(peer, protocol, request, { signal, addrs = [] } = {}) {
		const id = typeof peer === 'string' ? peerIdFromString(peer) : peer;
		const s = signal ?? AbortSignal.timeout(TIMEOUTS.answer);
		const target = addrs.length ? addrs.map((a) => multiaddr(a)) : id;
		const stream = await libp2p.dialProtocol(target, protocol, {
			runOnLimitedConnection: true,
			signal: s
		});
		try {
			const pb = pbStream(stream, { maxDataLength: LIMITS.response });
			await pb.write(request, ext.Request, { signal: s });
			const response = await pb.read(ext.Response, { signal: s });
			await stream.close({ signal: s }).catch(() => {});
			return response;
		} catch (error) {
			stream.abort(error instanceof Error ? error : new Error(String(error)));
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
			const connection = await libp2p.dial(addrs.length ? addrs.map((a) => multiaddr(a)) : id, {
				signal: AbortSignal.timeout(TIMEOUTS.online)
			});
			const known = await libp2p.peerStore.get(id).catch(() => null);
			const protocols = known?.protocols.length
				? known.protocols
				: await Promise.race([identified, wait(TIMEOUTS.online).then(() => [])]);
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
		 * @param {{ requestId?: string, version?: string }} [options]
		 */
		async call(peer, extensionId, command, args = {}, { requestId, version } = {}) {
			const protocol = await protocolOf(peer, extensionId, version);
			const id = requestId ?? toBase64url(randomBytes(16));
			const res = await exchange(peer, protocol, {
				command: {
					requestId: id,
					extensionId,
					command,
					args: Array.isArray(args) ? args : [],
					argsJson: Array.isArray(args) ? undefined : JSON.stringify(args),
					timestamp: BigInt(now())
				}
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
