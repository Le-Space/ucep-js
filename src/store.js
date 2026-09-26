// SPDX-License-Identifier: MIT
// Where provider and consumer keep grants and the catalogue. The default
// lives in memory; an app that must keep its grants across restarts
// (ucep-auth.md §11) passes its own, e.g. on IndexedDB, encrypted.

/**
 * @template T
 * @typedef {object} KeyValue
 * @property {(key: string) => Promise<T | undefined>} get
 * @property {(key: string, value: T) => Promise<void>} set
 * @property {(key: string) => Promise<void>} delete
 * @property {() => Promise<T[]>} values
 */

/**
 * @template T
 * @returns {KeyValue<T>}
 */
export function memoryStore() {
	/** @type {Map<string, T>} */
	const map = new Map();
	return {
		get: async (key) => structuredClone(map.get(key)),
		set: async (key, value) => void map.set(key, structuredClone(value)),
		delete: async (key) => void map.delete(key),
		values: async () => [...map.values()].map((v) => structuredClone(v))
	};
}
