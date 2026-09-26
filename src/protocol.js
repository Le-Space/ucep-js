// SPDX-License-Identifier: MIT
// Protocol IDs, versions, limits and scope names (ucep.md §3, §10, §11;
// ucep-auth.md §10).

/** The wire revision this library speaks (ucep.md §10). */
export const UCEP_VERSION = 2;

export const PROTOCOL_PREFIX = '/uc/extension/';

const EXTENSION_ID = /^[a-z0-9-]{1,64}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;
const SCOPE = /^([a-z0-9-]+):([a-z0-9-]+):([a-z0-9-]+)$/;

/** Limits of ucep.md §11, in bytes. */
export const LIMITS = Object.freeze({
	request: 64 * 1024,
	response: 1024 * 1024,
	limitedResponse: 64 * 1024,
	requestId: 128,
	icon: 32 * 1024
});

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
	 */
	constructor(code, message = code) {
		super(message);
		this.name = 'UcepError';
		this.code = code;
	}
}
