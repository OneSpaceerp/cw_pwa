/**
 * Visits, local-first.
 *
 * The screens read and write a working copy of each visit held here and mirrored to
 * IndexedDB. Changes are queued in the outbox and reconciled with the server's
 * answer when it arrives, so the app stays responsive on a weak connection and
 * usable with none.
 */
import { reactive } from "vue";

import { call, post } from "@/lib/api";
import * as db from "@/lib/db";
import { compressImage, uuid } from "@/lib/device";
import { todayISO } from "@/lib/format";
import { evaluateGeofence } from "@/lib/rules";

import { serviceType } from "./masters";
import { configureOutbox, enqueue, isLocalId, opsFor, outbox, removeOp, renameVisit, scheduleFlush } from "./outbox";
import { session, settings } from "./session";

const API = "cw_visit.api.v1.";
const LIST_KEY = "visit-list";
const DRAFT_SAVE_DELAY_MS = 1500;

const TABLES = ["readings", "findings", "operations", "requirements", "expenses", "actions"];
const TABLE_FIELDS = {
	readings: ["parameter", "reading_value", "status", "remarks"],
	findings: ["category", "severity", "observation", "recommendation"],
	operations: ["operation_type", "area_or_equipment", "duration_minutes", "chemicals_used", "outcome", "remarks"],
	requirements: ["item_code", "item_name", "quantity", "uom", "urgency", "reason", "remarks"],
	expenses: ["expense_type", "amount", "remarks"],
	actions: ["action_description", "due_date", "remarks"],
};
const SCALARS = ["executive_summary", "customer_representative", "customer_representative_phone"];

// Fields the server owns. They are taken from every server answer even while the
// engineer has unsent edits to the tables.
const SERVER_FIELDS = [
	"visit_status", "docstatus", "can_edit", "modified", "checkin_time", "checkin_latitude", "checkin_longitude",
	"checkin_accuracy", "distance_to_site_meters", "geofence_status", "geofence_reason", "checkout_time",
	"visit_duration_minutes", "submitted_for_review_on", "supervisor_decision", "supervisor_remarks",
	"review_timestamp", "site", "rules", "request", "evidence", "service_location", "service_request", "outcome",
];

export const visits = reactive({
	list: [],
	listLoadedAt: null,
	loadingList: false,
	listError: "",
	/** name -> working copy */
	records: {},
});

const saveTimers = new Map();

// ------------------------------------------------------------------ loading

export async function loadCachedVisits() {
	const cached = await db.get("kv", LIST_KEY);
	if (cached) {
		visits.list = cached.list;
		visits.listLoadedAt = cached.loadedAt;
	}
	for (const record of await db.getAll("visits")) {
		visits.records[record.name] = record;
	}
}

export async function refreshList() {
	if (visits.loadingList) return;
	visits.loadingList = true;
	try {
		const result = await call(`${API}my_visits`, { limit: 100 });
		visits.list = result.visits;
		visits.listLoadedAt = Date.now();
		visits.listError = "";
		await db.put("kv", db.plain({ list: visits.list, loadedAt: visits.listLoadedAt }), LIST_KEY);
		await pruneRecords();
	} catch (error) {
		visits.listError = error.network ? "" : error.message;
	} finally {
		visits.loadingList = false;
	}
}

/** Forget working copies of visits that are no longer on the engineer's list. */
async function pruneRecords() {
	const listed = new Set(visits.list.map((item) => item.name));
	for (const record of Object.values(visits.records)) {
		const busy = record.isLocal || record.dirty || opsFor(record.name).length;
		if (!listed.has(record.name) && !busy) {
			delete visits.records[record.name];
			await db.remove("visits", record.name);
		}
	}
}

/**
 * The list the screens show: the server's list with the device's own, newer
 * knowledge laid over it (a visit started offline shows as started).
 */
export function listItems() {
	const local = Object.values(visits.records)
		.filter((record) => record.isLocal)
		.map((record) => summary(record.data, record));
	const listed = visits.list.map((item) => {
		const record = visits.records[item.name];
		return record ? { ...item, ...summary(record.data, record) } : { ...item, pending: 0, failed: 0 };
	});
	return [...local, ...listed];
}

function summary(data, record) {
	const ops = opsFor(record.name);
	return {
		name: data.name,
		customer: data.customer,
		customer_name: data.customer_name,
		service_location: data.service_location,
		visit_type: data.visit_type,
		priority: data.priority,
		visit_status: data.visit_status,
		outcome: data.outcome,
		planned_date: data.planned_date,
		planned_start_time: data.planned_start_time,
		checkin_time: data.checkin_time,
		geofence_status: data.geofence_status,
		site: data.site,
		isLocal: Boolean(record.isLocal),
		pending: ops.filter((op) => op.status !== "failed").length,
		failed: ops.filter((op) => op.status === "failed").length,
	};
}

/** The working copy for a visit, fetched or restored as needed. Throws when it cannot be had. */
export async function openVisit(name) {
	let record = visits.records[name];
	if (!record) {
		const data = await call(`${API}visit`, { name });
		visits.records[name] = newRecord(name, data);
		// Read it back: the reactive proxy is what the screens must hold.
		record = visits.records[name];
		await persist(record);
		return record;
	}
	// Refresh in the background when that cannot lose anything typed on this device.
	if (session.online && canTakeServerCopy(record)) {
		refreshVisit(name).catch(() => {});
	}
	return record;
}

export async function refreshVisit(name) {
	const record = visits.records[name];
	if (!record || record.isLocal) return;
	const data = await call(`${API}visit`, { name });
	applyServer(record, data);
}

const canTakeServerCopy = (record) => !record.isLocal && !record.dirty && opsFor(record.name).length === 0;

function newRecord(name, data, extra = {}) {
	return {
		name,
		data: withKeys(data),
		rev: 0,
		dirty: false,
		isLocal: false,
		localPhotos: [],
		serverError: "",
		fetchedAt: Date.now(),
		...extra,
	};
}

/** Give every table row a stable key for rendering; the server's row name when it has one. */
function withKeys(data) {
	for (const table of ["checklist_items", ...TABLES, "evidence"]) {
		data[table] = (data[table] || []).map((row) => ({ ...row, _key: row._key || row.name || uuid() }));
	}
	return data;
}

const persist = (record) => db.put("visits", db.plain(record));

// ---------------------------------------------------------------- reconciling

function applyServer(record, data, { sentRev = null, op = null } = {}) {
	const editedSinceSend = sentRev !== null && record.rev !== sentRev;
	const moreDataQueued = opsFor(record.name).some(
		(other) => other.id !== op?.id && ["save_draft", "submit_visit"].includes(other.action)
	);

	if (!editedSinceSend && !moreDataQueued) {
		record.data = withKeys(data);
		record.dirty = false;
	} else {
		// Newer edits exist on the device. Take what only the server decides and keep the rest.
		for (const field of SERVER_FIELDS) {
			if (field in data) record.data[field] = data[field];
		}
		if (!record.data.checklist_items?.length) record.data.checklist_items = data.checklist_items || [];
		withKeys(record.data);
	}
	record.serverError = "";
	record.fetchedAt = Date.now();
	persist(record);
}

// -------------------------------------------------------------------- editing

/** Change the working copy. `mutate` receives the visit data and edits it in place. */
export function edit(name, mutate) {
	const record = visits.records[name];
	if (!record) return;
	mutate(record.data);
	record.rev += 1;
	record.dirty = true;
	persist(record);

	clearTimeout(saveTimers.get(name));
	saveTimers.set(
		name,
		setTimeout(() => queueDraftSave(name), DRAFT_SAVE_DELAY_MS)
	);
}

function queueDraftSave(name) {
	saveTimers.delete(name);
	const record = visits.records[name];
	if (!record || !record.dirty) return;
	// One pending save per visit is enough: the payload is built when it is sent.
	enqueue({ action: "save_draft", visit: name, label: "Save visit data", coalesce: true }).catch(() => {});
}

function draftPayload(data) {
	const payload = {};
	for (const field of SCALARS) payload[field] = data[field] ?? "";
	payload.checklist_items = (data.checklist_items || []).map((row) => ({
		name: row.name,
		response: row.response || "",
		response_value: row.response_value ?? "",
		remarks: row.remarks || "",
	}));
	for (const table of TABLES) {
		payload[table] = (data[table] || []).map((row) => {
			const out = row.name ? { name: row.name } : {};
			for (const field of TABLE_FIELDS[table]) out[field] = row[field] ?? null;
			return out;
		});
	}
	return payload;
}

export const photoCount = (record) => (record.data.evidence?.length || 0) + record.localPhotos.length;

// -------------------------------------------------------------------- actions

function localTimestamp() {
	const now = new Date();
	const pad = (n) => String(n).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function gpsPayload(position) {
	return {
		latitude: position?.latitude ?? null,
		longitude: position?.longitude ?? null,
		accuracy: position?.accuracy ?? null,
		client_timestamp: localTimestamp(),
	};
}

/** Show the check-in immediately; the server's time and geofence result replace this estimate. */
function markStarted(data, position, reason) {
	const estimate = evaluateGeofence(position, data.site, settings());
	data.visit_status = "In Progress";
	data.checkin_time = localTimestamp();
	data.checkin_latitude = position?.latitude ?? null;
	data.checkin_longitude = position?.longitude ?? null;
	data.checkin_accuracy = position?.accuracy ?? null;
	data.geofence_status = estimate.status;
	data.distance_to_site_meters = estimate.distance;
	if (reason) data.geofence_reason = reason;
}

export async function startVisit(name, { position = null, reason = "" } = {}) {
	const record = visits.records[name];
	const previous = db.plain(record.data);
	markStarted(record.data, position, reason);
	await persist(record);
	await enqueue({
		action: "start_visit",
		visit: name,
		label: "Start visit",
		payload: { ...gpsPayload(position), reason: reason || null },
		meta: { previous: pick(previous, SERVER_FIELDS) },
	});
}

export async function submitVisit(name, { outcome, summary, representative, phone, signature, position }) {
	const record = visits.records[name];
	clearTimeout(saveTimers.get(name));
	saveTimers.delete(name);

	// The submit carries the full data, so a queued draft save would be redundant.
	for (const op of opsFor(name)) {
		if (op.action === "save_draft" && op.status === "pending") await removeOp(op.id);
	}

	const previous = pick(db.plain(record.data), SERVER_FIELDS);
	record.data.outcome = outcome;
	record.data.executive_summary = summary || "";
	record.data.customer_representative = representative || "";
	record.data.customer_representative_phone = phone || "";
	record.data.visit_status = "Pending Review";
	record.data.can_edit = false;
	record.dirty = false;
	await persist(record);

	await enqueue({
		action: "submit_visit",
		visit: name,
		label: "Submit for review",
		payload: {
			data: draftPayload(record.data),
			outcome,
			executive_summary: summary || "",
			customer_representative: representative || "",
			customer_representative_phone: phone || "",
			customer_signature: signature || null,
			...gpsPayload(position),
		},
		meta: { previous },
	});
}

export async function addPhoto(name, file, { category = "Other", caption = "" } = {}) {
	const record = visits.records[name];
	const blob = await compressImage(file);
	const id = uuid();
	// A compressed photo is a JPEG; anything passed through untouched keeps its own name.
	const filename = blob !== file ? `visit-photo-${Date.now()}.jpg` : file.name || `evidence-${Date.now()}`;
	await db.put("blobs", blob, id);

	record.localPhotos.push({ id, category, caption, createdAt: Date.now(), failed: false });
	await persist(record);
	await enqueue({
		id,
		action: "upload_evidence",
		visit: name,
		label: "Upload photo",
		payload: { blobId: id, category, caption, filename },
	});
}

export async function removePhoto(name, photo) {
	const record = visits.records[name];
	if (photo.local) {
		await removeOp(photo.id);
		await dropLocalPhoto(record, photo.id);
		return;
	}
	record.data.evidence = record.data.evidence.filter((row) => row.name !== photo.name);
	await persist(record);
	await enqueue({ action: "remove_evidence", visit: name, label: "Remove photo", payload: { row: photo.name } });
}

async function dropLocalPhoto(record, id) {
	record.localPhotos = record.localPhotos.filter((photo) => photo.id !== id);
	await db.remove("blobs", id);
	await persist(record);
}

/** Object URL for a photo still waiting to upload. The caller revokes it. */
export async function localPhotoUrl(id) {
	const blob = await db.get("blobs", id);
	return blob ? URL.createObjectURL(blob) : "";
}

/** Log an unplanned visit. It exists on the device at once and on the server after sync. */
export async function createVisit({ customer, visitType, location, newLocation, priority, description, position, reason, startNow = true }) {
	const name = `local-${uuid()}`;
	const type = serviceType(visitType) || {};
	const site = location
		? { ...location }
		: newLocation
			? {
					location_name: newLocation.location_name,
					address_display: newLocation.address || "",
					latitude: position?.latitude ?? null,
					longitude: position?.longitude ?? null,
					verification_status: "Pending Verification",
				}
			: null;

	const data = {
		name,
		customer: customer.name,
		customer_name: customer.customer_name,
		service_location: location?.name || null,
		visit_type: visitType,
		priority: priority || "Medium",
		visit_status: "Planned",
		creation_source: "Engineer On-Site",
		planned_date: todayISO(),
		description: description || "",
		geofence_status: "Not Evaluated",
		site,
		rules: { min_readings: type.min_readings || 0, min_evidence_photos: type.min_evidence_photos || 0 },
		can_edit: true,
		docstatus: 0,
	};
	if (startNow) markStarted(data, position, reason);

	visits.records[name] = newRecord(name, data, { isLocal: true });
	await persist(visits.records[name]);
	await enqueue({
		action: "create_visit",
		visit: name,
		label: "Create visit",
		payload: {
			customer: customer.name,
			visit_type: visitType,
			service_location: location?.name || null,
			new_location: location ? null : newLocation || null,
			priority: priority || "Medium",
			description: description || "",
			start_now: startNow ? 1 : 0,
			reason: reason || null,
			...gpsPayload(position),
		},
	});
	return name;
}

/** Throw away a queued operation and undo what it had shown on screen. */
export async function discardOp(op) {
	await removeOp(op.id);
	const record = visits.records[op.visit];
	if (!record) return;

	if (op.action === "create_visit") {
		// Everything queued for a visit that will never exist goes with it.
		for (const other of opsFor(op.visit)) {
			if (other.action === "upload_evidence") await db.remove("blobs", other.id);
			await removeOp(other.id);
		}
		for (const photo of record.localPhotos) await db.remove("blobs", photo.id);
		delete visits.records[op.visit];
		await db.remove("visits", op.visit);
		return;
	}
	if (op.action === "upload_evidence") {
		await dropLocalPhoto(record, op.id);
		return;
	}
	await rollBack(record, op);
	scheduleFlush();
}

async function rollBack(record, op) {
	if (op.meta?.previous) Object.assign(record.data, op.meta.previous);
	if (op.action === "submit_visit") record.dirty = true;
	await persist(record);
}

function pick(source, fields) {
	return Object.fromEntries(fields.filter((field) => field in source).map((field) => [field, source[field]]));
}

// --------------------------------------------------------- outbox integration

async function send(op) {
	const key = { idempotency_key: op.id };

	switch (op.action) {
		case "create_visit":
			return post(`${API}create_visit`, { ...op.payload, ...key });

		case "start_visit":
			return post(`${API}start_visit`, { name: op.visit, ...op.payload, ...key });

		case "save_draft": {
			const record = visits.records[op.visit];
			if (!record) return { skipped: true };
			op.sentRev = record.rev;
			// The payload changes between attempts, so the key carries the revision:
			// a replayed answer for older data must not swallow a newer save.
			return post(`${API}save_draft`, {
				name: op.visit,
				data: draftPayload(record.data),
				idempotency_key: `${op.id}:${record.rev}`,
			});
		}

		case "submit_visit":
			return post(`${API}submit_visit`, { name: op.visit, ...op.payload, ...key });

		case "upload_evidence": {
			const blob = await db.get("blobs", op.payload.blobId);
			if (!blob) throw new Error("The photo is no longer on this device.");
			const form = new FormData();
			form.append("file", blob, op.payload.filename);
			form.append("name", op.visit);
			form.append("category", op.payload.category);
			form.append("caption", op.payload.caption || "");
			form.append("idempotency_key", op.id);
			return post(`${API}upload_evidence`, {}, { formData: form, timeout: 120000 });
		}

		case "remove_evidence":
			return post(`${API}remove_evidence`, { name: op.visit, row: op.payload.row, ...key });

		default:
			throw new Error(`Unknown operation: ${op.action}`);
	}
}

async function onSuccess(op, result) {
	if (!result || result.skipped) return;

	if (op.action === "create_visit") {
		await adoptServerVisit(op.visit, result);
		return;
	}

	const record = visits.records[op.visit];
	if (!record) return;

	if (op.action === "upload_evidence") {
		record.data.evidence = withKeys({ evidence: result.evidence }).evidence;
		await dropLocalPhoto(record, op.id);
	} else if (op.action === "remove_evidence") {
		record.data.evidence = withKeys({ evidence: result.evidence }).evidence;
		await persist(record);
	} else if (result.data) {
		applyServer(record, result.data, { sentRev: op.sentRev ?? null, op });
	}

	if (["start_visit", "submit_visit"].includes(op.action)) refreshList();
}

/** The server created the visit: swap the temporary id for the real one everywhere. */
async function adoptServerVisit(localName, result) {
	const record = visits.records[localName];
	const realName = result.visit;
	if (!record) return;

	delete visits.records[localName];
	await db.remove("visits", localName);
	await renameVisit(localName, realName);

	record.name = realName;
	record.isLocal = false;
	record.data.name = realName;
	visits.records[realName] = record;
	const adopted = visits.records[realName];
	applyServer(adopted, result.data, { sentRev: 0 });
	// Keep it on the list until the next refresh brings the server's own row.
	visits.list.unshift(summary(adopted.data, adopted));

	window.dispatchEvent(new CustomEvent("cw:visit-renamed", { detail: { from: localName, to: realName } }));
	refreshList();
}

async function onFailure(op, error) {
	const record = visits.records[op.visit];
	if (!record) return;

	record.serverError = error?.message || "The server rejected this change.";
	if (op.action === "upload_evidence") {
		const photo = record.localPhotos.find((item) => item.id === op.id);
		if (photo) photo.failed = true;
		await persist(record);
		return;
	}
	// A rejected change is taken out of the queue so later work on the visit is not
	// stuck behind it. The reason stays on the visit until the engineer acts on it.
	await removeOp(op.id);
	if (["start_visit", "submit_visit"].includes(op.action)) {
		// Undo the optimistic status so the engineer can fix the problem and try again.
		await rollBack(record, op);
	} else if (op.action === "remove_evidence") {
		refreshVisit(record.name).catch(() => {});
	}
	await persist(record);
}

export function clearServerError(name) {
	const record = visits.records[name];
	if (!record) return;
	record.serverError = "";
	persist(record);
}

configureOutbox({ send, onSuccess, onFailure });

/** True while the visit has anything not yet confirmed by the server. */
export const hasUnsynced = (name) =>
	isLocalId(name) || outbox.ops.some((op) => op.visit === name) || Boolean(visits.records[name]?.dirty);
