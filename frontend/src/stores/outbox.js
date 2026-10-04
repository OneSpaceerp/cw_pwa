/**
 * The outbox: every change the engineer makes becomes a durable, ordered operation
 * that is sent when the server can be reached.
 *
 * - Each operation has an idempotency key, so a retry after an unclear timeout
 *   cannot act twice.
 * - Operations for one visit are sent in the order they were made. When one fails
 *   for good, the ones behind it wait instead of running against the wrong state.
 * - Nothing fails silently: a rejected operation stays in the list with the
 *   server's reason until the engineer retries or discards it.
 */
import { reactive } from "vue";

import * as db from "@/lib/db";
import { uuid } from "@/lib/device";

import { session } from "./session";

const MAX_QUEUE = 200;
const MAX_ATTEMPTS = 6;

export const outbox = reactive({
	ops: [],
	flushing: false,
	lastFlushAt: null,
	lastError: "",
});

let handlers = { send: null, onSuccess: null, onFailure: null };
let counter = 0;
let flushAgain = false;

/** The visits store supplies how an operation is sent and what happens afterwards. */
export function configureOutbox(next) {
	handlers = { ...handlers, ...next };
}

export const isLocalId = (name) => String(name || "").startsWith("local-");
export const opsFor = (visit) => outbox.ops.filter((op) => op.visit === visit);
export const mine = () => outbox.ops.filter((op) => op.user === session.boot?.user);
export const waitingCount = () => mine().filter((op) => op.status !== "failed").length;
export const failedCount = () => mine().filter((op) => op.status === "failed").length;

export async function loadOutbox() {
	const stored = await db.getAll("outbox");
	// "sending" only exists in memory; after a reload such an operation is simply pending again.
	outbox.ops = stored
		.map((op) => ({ ...op, status: op.status === "sending" ? "pending" : op.status }))
		.sort((a, b) => a.seq - b.seq);
}

const save = (op) => db.put("outbox", db.plain(op));

export async function enqueue({ id, action, visit, payload = {}, label, meta = {}, coalesce = false }) {
	if (coalesce) {
		const existing = outbox.ops.find(
			(op) => op.action === action && op.visit === visit && op.status === "pending"
		);
		if (existing) {
			existing.payload = payload;
			await save(existing);
			scheduleFlush();
			return existing;
		}
	}
	if (outbox.ops.length >= MAX_QUEUE) {
		throw new Error("Too many changes are waiting to sync. Connect to the internet before adding more.");
	}

	const op = {
		id: id || uuid(),
		seq: Date.now() * 1000 + (counter++ % 1000),
		user: session.boot?.user,
		action,
		visit,
		payload,
		label,
		meta,
		status: "pending",
		attempts: 0,
		error: "",
		createdAt: Date.now(),
	};
	outbox.ops.push(op);
	await save(op);
	scheduleFlush();
	return op;
}

export async function removeOp(id) {
	const index = outbox.ops.findIndex((op) => op.id === id);
	if (index >= 0) outbox.ops.splice(index, 1);
	await db.remove("outbox", id);
}

/** A visit created offline gets its real id once the server has it. */
export async function renameVisit(from, to) {
	for (const op of outbox.ops) {
		if (op.visit === from) {
			op.visit = to;
			await save(op);
		}
	}
}

export async function retryOp(id) {
	const op = outbox.ops.find((item) => item.id === id);
	if (!op) return;
	op.status = "pending";
	op.attempts = 0;
	op.error = "";
	await save(op);
	return flush();
}

let timer = null;
export function scheduleFlush(delay = 300) {
	clearTimeout(timer);
	timer = setTimeout(flush, delay);
}

export async function flush() {
	if (outbox.flushing) {
		flushAgain = true;
		return;
	}
	if (!session.boot?.user || !handlers.send) return;

	outbox.flushing = true;
	outbox.lastError = "";
	const blocked = new Set();

	try {
		// Work on a snapshot of ids: handlers add, rename and remove operations as we go.
		for (const id of mine().map((op) => op.id)) {
			const op = outbox.ops.find((item) => item.id === id);
			if (!op) continue;

			if (op.status === "failed") {
				blocked.add(op.visit);
				continue;
			}
			if (blocked.has(op.visit)) continue;
			if (isLocalId(op.visit) && op.action !== "create_visit") {
				// The visit itself has not reached the server yet.
				blocked.add(op.visit);
				continue;
			}

			op.status = "sending";
			try {
				const result = await handlers.send(op);
				await removeOp(op.id);
				await handlers.onSuccess?.(op, result);
			} catch (error) {
				op.attempts += 1;
				op.error = error?.message || "Failed";

				if (error?.network || !session.boot) {
					// Offline, unreachable, or signed out mid-sync: nothing else will get
					// through either, and none of it is the operation's fault.
					op.status = "pending";
					outbox.lastError = op.error;
					await save(op);
					break;
				}
				if (error?.retryable && op.attempts < MAX_ATTEMPTS) {
					op.status = "pending";
					outbox.lastError = op.error;
					await save(op);
					break;
				}

				op.status = "failed";
				blocked.add(op.visit);
				await save(op);
				await handlers.onFailure?.(op, error);
			}
		}
		outbox.lastFlushAt = Date.now();
	} finally {
		outbox.flushing = false;
		if (flushAgain) {
			flushAgain = false;
			scheduleFlush(50);
		}
	}
}
