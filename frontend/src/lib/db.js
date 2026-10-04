/**
 * Local storage for offline work, on IndexedDB.
 *
 *   kv      small cached values (boot info, catalogue, visit list)
 *   visits  one working copy per visit
 *   outbox  operations waiting to reach the server, in order
 *   blobs   photos waiting to upload
 *
 * If IndexedDB is unavailable (some private-browsing modes) an in-memory store is
 * used, so the app still works online and simply forgets everything on reload.
 */
import { openDB } from "idb";

const NAME = "cw-visits";
const VERSION = 1;
const STORES = ["kv", "visits", "outbox", "blobs"];

let memory = null;
const ready = openDB(NAME, VERSION, {
	upgrade(db) {
		db.createObjectStore("kv");
		db.createObjectStore("visits", { keyPath: "name" });
		db.createObjectStore("outbox", { keyPath: "id" });
		db.createObjectStore("blobs");
	},
}).catch(() => {
	memory = Object.fromEntries(STORES.map((store) => [store, new Map()]));
	return null;
});

const KEY_PATHS = { visits: "name", outbox: "id" };

/** True when data will survive a reload. */
export async function isPersistent() {
	return Boolean(await ready);
}

export async function get(store, key) {
	const db = await ready;
	return db ? db.get(store, key) : memory[store].get(key);
}

export async function getAll(store) {
	const db = await ready;
	return db ? db.getAll(store) : [...memory[store].values()];
}

/** Stores with a key path take `put(store, value)`; the others take `put(store, value, key)`. */
export async function put(store, value, key) {
	const db = await ready;
	if (db) return KEY_PATHS[store] ? db.put(store, value) : db.put(store, value, key);
	memory[store].set(KEY_PATHS[store] ? value[KEY_PATHS[store]] : key, value);
}

export async function remove(store, key) {
	const db = await ready;
	return db ? db.delete(store, key) : memory[store].delete(key);
}

export async function clearAll() {
	const db = await ready;
	if (!db) {
		for (const store of STORES) memory[store].clear();
		return;
	}
	const transaction = db.transaction(STORES, "readwrite");
	await Promise.all(STORES.map((store) => transaction.objectStore(store).clear()));
	await transaction.done;
}

/** Reactive proxies and class instances cannot be structured-cloned; store plain data. */
export function plain(value) {
	return JSON.parse(JSON.stringify(value));
}
