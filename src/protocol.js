// SPDX-License-Identifier: MIT
// Protocol IDs, versions, limits and scope names (ucep.md §3, §10, §11;
// ucep-auth.md §10).

/** The wire revision this library speaks (ucep.md §10). */
export const UCEP_VERSION = 2;

export const PROTOCOL_PREFIX = '/uc/extension/';

const EXTENSION_ID = /^[a-z0-9-]{1,64}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;
const SCOPE = /^([a-z0-9-]+):([a-z0-9-]+):([a-z0-9-]+)$/;

/**
 * Limits of ucep.md §11, in bytes: the defaults, which hold unless an
 * extension states larger ones in its manifest (§11.1), and always on a
 * limited connection.
 */
export const LIMITS = Object.freeze({
	request: 64 * 1024,
	response: 1024 * 1024,
	limitedResponse: 64 * 1024,
	requestId: 128,
	icon: 32 * 1024
});

/** The largest limit the manifest's uint32 fields can state. */
const MAX_STATED = 2 ** 32 - 1;

/**
 * @typedef {object} MessageLimits
 * @property {number} request bytes of a Request message
 * @property {number} response bytes of a Response message
 */

/**
 * The limits an extension states in its manifest (ucep.md §11.1): a field
 * that is absent, 0 or below the default means the default.
 *
 * @param {{ limits?: { request?: number, response?: number } | null } | null | undefined} manifest
 * @returns {MessageLimits}
 */
export function statedLimits(manifest) {
	const l = manifest?.limits;
	/** @param {unknown} v @param {number} fallback */
	const pick = (v, fallback) => {
		const n = Number(v ?? 0);
		return Number.isFinite(n) && n > fallback ? Math.min(n, MAX_STATED) : fallback;
	};
	return {
		request: pick(l?.request, LIMITS.request),
		response: pick(l?.response, LIMITS.response)
	};
}

/**
 * Check a provider's or consumer's own `limits` option: whole bytes, at most
 * what the manifest can state. `floor` is the least a provider may accept.
 *
 * @param {Partial<MessageLimits> | undefined} limits
 * @param {{ floor?: boolean }} [options]
 * @returns {MessageLimits}
 */
export function ownLimits(limits, { floor = false } = {}) {
	/** @param {'request' | 'response'} name */
	const one = (name) => {
		const v = limits?.[name];
		if (v === undefined) return LIMITS[name];
		if (!Number.isSafeInteger(v) || v <= 0 || v > MAX_STATED) {
			throw new Error(`limits.${name} must be a whole number of bytes up to ${MAX_STATED}`);
		}
		if (floor && v < LIMITS[name]) {
			throw new Error(`limits.${name} may not be below the default of ${LIMITS[name]} bytes`);
		}
		return v;
	};
	return { request: one('request'), response: one('response') };
}

/**
 * A relayed connection counts as limited (ucep.md §11) unless its relay grants
 * it at least this many bytes: then a full answer is a small part of what the
 * connection may carry, as on a direct one. js-libp2p's default is 128 KiB per
 * relayed connection; a relay that allows more says so in its limits.
 */
export const RELAY_BUDGET = 32 * 1024 * 1024;

/**
 * Whether answers on this connection are capped at `LIMITS.limitedResponse`:
 * a relayed connection with a data limit below `RELAY_BUDGET`. A direct
 * connection has no `limits`; a relayed one limited by time only has no
 * `limits.bytes`.
 *
 * @param {{ limits?: { bytes?: bigint | number, seconds?: number } | null }} connection
 * @returns {boolean}
 */
export function isLimited(connection) {
	const limits = connection?.limits;
	if (limits == null) return false;
	if (limits.bytes == null) return false;
	return BigInt(limits.bytes) < BigInt(RELAY_BUDGET);
}

/** Timeouts of ucep.md §5, in ms. */
export const TIMEOUTS = Object.freeze({ read: 10_000, answer: 60_000, online: 15_000 });

/**
 * `/uc/extension/invoice/0.1.0`
 *
 * @param {string} extensionId
 * @param {string} version SemVer, without build metadata
 */
export function protocolId(extensionId, version) {
	if (!EXTENSION_ID.test(extensionId)) throw new Error(`Not an extension id: ${extensionId}`);
	if (!SEMVER.test(version)) throw new Error(`Not a SemVer version: ${version}`);
	return `${PROTOCOL_PREFIX}${extensionId}/${version}`;
}

/**
 * @param {string} protocol
 * @returns {{ extensionId: string, version: string, major: number, minor: number } | null}
 */
export function parseProtocolId(protocol) {
	if (typeof protocol !== 'string' || !protocol.startsWith(PROTOCOL_PREFIX)) return null;
	const [extensionId, version, ...rest] = protocol.slice(PROTOCOL_PREFIX.length).split('/');
	if (rest.length || !EXTENSION_ID.test(extensionId ?? '')) return null;
	const m = SEMVER.exec(version ?? '');
	if (!m) return null;
	return { extensionId, version, major: Number(m[1]), minor: Number(m[2]) };
}

/**
 * Whether an offered version serves a consumer that needs `wanted`: the
 * same major version, at least the wanted minor (ucep.md §3).
 *
 * @param {string} offered
 * @param {string} wanted
 */
export function compatible(offered, wanted) {
	const a = SEMVER.exec(offered);
	const b = SEMVER.exec(wanted);
	return Boolean(a && b && a[1] === b[1] && Number(a[2]) >= Number(b[2]));
}

/**
 * Whether a scope is well formed and belongs to the extension (ucep-auth.md §10).
 *
 * @param {string} scope
 * @param {string} [extensionId]
 */
export function isScope(scope, extensionId) {
	const m = SCOPE.exec(String(scope));
	return Boolean(m && (extensionId === undefined || m[1] === extensionId));
}

export class UcepError extends Error {
	/**
	 * @param {string} code an ErrorCode name, e.g. PAIRING_REQUIRED
	 * @param {string} [message]
	 * @param {{ limit?: number }} [details] `limit`: for TOO_LARGE, the bytes that were allowed
	 */
	constructor(code, message = code, details = {}) {
		super(message);
		this.name = 'UcepError';
		this.code = code;
		if (details.limit !== undefined) this.limit = details.limit;
	}
}
