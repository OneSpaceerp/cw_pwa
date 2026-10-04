/**
 * A stand-in for ERPNext, for working on the app without a bench.
 *
 *   npm run build:standalone && npm run mock      ->  http://localhost:8090
 *   sign in with  engineer@example.com / demo
 *
 * It serves the standalone build and answers the same endpoints as
 * cw_visit.api.v1 with in-memory data. It follows the server's rules closely enough
 * to exercise the screens (status transitions, idempotency keys, completeness
 * checks), but it is NOT the source of truth: cw_visit is. Data resets on restart.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, "../../dist");
const PORT = Number(process.env.PORT) || 8090;
const USER = "engineer@example.com";
const PASSWORD = "demo";

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");

// ------------------------------------------------------------------- data
const settings = {
	allow_engineer_created_visits: 1,
	allow_engineer_proposed_locations: 1,
	allow_checkin_without_gps: 1,
	require_reason_for_gps_exception: 1,
	default_geofence_radius_meters: 200,
	warning_buffer_meters: 300,
	max_evidence_file_size_mb: 10,
};

const masters = {
	parameters: [
		{ name: "PH-01", parameter_name: "pH", category: "General Water Treatment", unit: "pH", data_type: "Float", default_min_value: 6.5, default_max_value: 8.5 },
		{ name: "TDS-01", parameter_name: "Total Dissolved Solids (TDS)", category: "RO & Membrane", unit: "ppm", data_type: "Float", default_min_value: 50, default_max_value: 500 },
		{ name: "COND-01", parameter_name: "Conductivity", category: "Cooling Tower", unit: "µS/cm", data_type: "Float", default_min_value: 200, default_max_value: 2500 },
		{ name: "TURB-01", parameter_name: "Turbidity", category: "General Water Treatment", unit: "NTU", data_type: "Float", default_min_value: 0, default_max_value: 5 },
		{ name: "CL-01", parameter_name: "Free Chlorine", category: "Potable Water", unit: "ppm", data_type: "Float", default_min_value: 0.2, default_max_value: 2 },
	],
	finding_categories: [{ name: "Scaling", default_severity: "Major" }, { name: "Corrosion", default_severity: "Major" }, { name: "Leak", default_severity: "Minor" }, { name: "Biofouling", default_severity: "Major" }],
	operation_types: [{ name: "Basin Washing", category: "Cleaning" }, { name: "Filter Backwash", category: "Cleaning" }, { name: "Chemical Dosing Adjustment", category: "Chemical Treatment" }, { name: "Pipeline Flushing", category: "Flushing" }],
	service_types: [
		{ name: "Routine Water Inspection", default_sla_hours: 48, min_readings: 2, min_evidence_photos: 1 },
		{ name: "Emergency Breakdown", default_sla_hours: 4, min_readings: 0, min_evidence_photos: 1 },
		{ name: "Washing & Flushing", default_sla_hours: 24, min_readings: 0, min_evidence_photos: 0 },
	],
	checklist_templates: [],
	options: {
		outcome: ["Resolved", "Partially Resolved", "Not Resolved", "Follow-up Required", "Customer Unavailable", "Cancelled"],
		priority: ["Low", "Medium", "High", "Critical"],
		severity: ["Info", "Minor", "Major", "Critical"],
		operation_outcome: ["Successful", "Partially Successful", "Incomplete", "Failed"],
		urgency: ["Normal", "Urgent", "Emergency"],
		expense_type: ["Travel / Transportation", "Fuel", "Meals", "Lodging", "Materials / Hardware", "Other"],
		evidence_category: ["Before Inspection", "During Operation", "After Operation", "Defect / Leak", "Meter / Gauge", "Customer Acknowledgement", "Expense Receipt", "Other"],
		checklist_response: ["Pass", "Fail", "N/A", "Yes", "No"],
	},
	currency: "EGP",
};

const customers = [
	{ name: "CUST-0001", customer_name: "Nile Beverages Co." },
	{ name: "CUST-0002", customer_name: "Delta Textiles" },
	{ name: "CUST-0003", customer_name: "October Pharma" },
];

const sites = {
	"LOC-NB-01": { name: "LOC-NB-01", location_name: "Nile Beverages - Bottling Plant", site_code: "NB-01", customer: "CUST-0001", latitude: 29.972, longitude: 30.941, geofence_radius_meters: 200, verification_status: "Verified", address_display: "Plot 14, Industrial Zone 3\n6th of October City", primary_contact_person: "Mona Adel", primary_contact_phone: "+20 100 555 0101", operating_hours: "08:00 to 17:00", special_site_instructions: "Report to the security gate first. Safety shoes and helmet are mandatory inside the plant." },
	"LOC-DT-01": { name: "LOC-DT-01", location_name: "Delta Textiles - Dye House", site_code: "DT-01", customer: "CUST-0002", latitude: 30.06, longitude: 31.24, geofence_radius_meters: 200, verification_status: "Verified", address_display: "Mahalla Road, km 12", primary_contact_person: "Hany Samir", primary_contact_phone: "+20 100 555 0202", operating_hours: "", special_site_instructions: "" },
};

let counter = 40;
const visits = new Map();
const syncLog = new Map();
const TABLES = ["readings", "findings", "operations", "requirements", "expenses", "actions"];

function checklist() {
	return [
		{ checklist_item: "Inspect dosing pumps and injection lines", response_type: "Pass/Fail", is_mandatory: 1, guidance: "Look for leaks and air locks." },
		{ checklist_item: "Chemical tanks above minimum level", response_type: "Yes/No", is_mandatory: 1, guidance: "" },
		{ checklist_item: "Feed pump pressure", response_type: "Numeric Value", is_mandatory: 0, guidance: "In bar, from the gauge." },
	].map((row, index) => ({ name: `chk-${counter}-${index}`, idx: index + 1, response: "", response_value: "", remarks: "", ...row }));
}

function makeVisit(values) {
	const name = `VISIT-2026-${String(++counter).padStart(4, "0")}`;
	const type = masters.service_types.find((item) => item.name === values.visit_type) || {};
	const visit = {
		name,
		docstatus: 0,
		priority: "Medium",
		visit_status: "Planned",
		creation_source: "Admin Scheduled",
		planned_date: today(),
		geofence_status: "Not Evaluated",
		assigned_engineer: "EMP-0007",
		engineer_name: "Omar Hassan",
		description: "",
		checklist_items: checklist(),
		readings: [], findings: [], operations: [], requirements: [], expenses: [], actions: [], evidence: [],
		modified: now(),
		rules: { min_readings: type.min_readings || 0, min_evidence_photos: type.min_evidence_photos || 0 },
		...values,
	};
	visits.set(name, visit);
	return visit;
}

makeVisit({ customer: "CUST-0001", customer_name: "Nile Beverages Co.", service_location: "LOC-NB-01", visit_type: "Routine Water Inspection", priority: "High", planned_start_time: "10:00:00", planned_end_time: "12:00:00", description: "Monthly inspection of the RO skid and cooling tower basin.", service_request: "SR-2026-0012" });
makeVisit({ customer: "CUST-0002", customer_name: "Delta Textiles", service_location: "LOC-DT-01", visit_type: "Washing & Flushing", planned_start_time: "14:30:00", description: "Basin washing after the dye-house shutdown." });
makeVisit({ customer: "CUST-0001", customer_name: "Nile Beverages Co.", service_location: "LOC-NB-01", visit_type: "Emergency Breakdown", priority: "Critical", planned_date: addDays(1), planned_start_time: "08:00:00", description: "Dosing pump tripping on high pressure." });
makeVisit({ customer: "CUST-0002", customer_name: "Delta Textiles", service_location: "LOC-DT-01", visit_type: "Routine Water Inspection", planned_date: addDays(-2), visit_status: "Correction Required", checkin_time: now(), geofence_status: "Verified", distance_to_site_meters: 34, supervisor_decision: "Correction Required", supervisor_remarks: "The TDS reading is missing. Please add it and resubmit." });
makeVisit({ customer: "CUST-0001", customer_name: "Nile Beverages Co.", service_location: "LOC-NB-01", visit_type: "Routine Water Inspection", planned_date: addDays(-6), visit_status: "Approved", docstatus: 1, outcome: "Resolved", checkin_time: now(), checkout_time: now(), geofence_status: "Verified", distance_to_site_meters: 21, visit_duration_minutes: 95 });

const requests = {
	"SR-2026-0012": { name: "SR-2026-0012", status: "Scheduled", priority: "High", issue_description: "Customer reports rising conductivity on the RO permeate over the last two weeks.", response_due_date: `${addDays(1)} 12:00:00`, sla_breached: 0 },
};

const alerts = [
	{ name: "n1", subject: "New visit assigned: Nile Beverages Co. today", document_type: "CW Site Visit", document_name: "VISIT-2026-0041", read: 0, creation: now() },
	{ name: "n2", subject: "Visit VISIT-2026-0044 needs correction", document_type: "CW Site Visit", document_name: "VISIT-2026-0044", read: 0, creation: now() },
];

// ------------------------------------------------------------------ rules
class ApiError extends Error {
	constructor(message, status = 417, excType = "ValidationError") {
		super(message);
		this.status = status;
		this.excType = excType;
	}
}

const EDITABLE = ["Planned", "In Progress", "Correction Required"];
const hasGps = (lat, lon) => lat != null && lon != null && !(Number(lat) === 0 && Number(lon) === 0);

function distance(lat1, lon1, lat2, lon2) {
	const rad = (d) => (d * Math.PI) / 180;
	const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
	return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
}

function geofence(visit, lat, lon) {
	const site = sites[visit.service_location];
	if (!hasGps(lat, lon)) return ["Exception", null];
	if (!site || !hasGps(site.latitude, site.longitude)) return ["Warning", null];
	const meters = distance(Number(lat), Number(lon), site.latitude, site.longitude);
	const radius = site.geofence_radius_meters || settings.default_geofence_radius_meters;
	if (meters <= radius) return [site.verification_status === "Pending Verification" ? "Warning" : "Verified", meters];
	if (meters <= radius + settings.warning_buffer_meters) return ["Warning", meters];
	return ["Exception", meters];
}

function classify(row) {
	const master = masters.parameters.find((item) => item.name === row.parameter);
	if (!master) throw new ApiError(`Could not find Parameter: ${row.parameter}`, 417, "LinkValidationError");
	const value = Number(row.reading_value);
	const out = String(row.reading_value ?? "").trim() !== "" && Number.isFinite(value) && (value < master.default_min_value || value > master.default_max_value);
	return {
		...row,
		parameter_name: master.parameter_name,
		unit: master.unit,
		min_range: master.default_min_value,
		max_range: master.default_max_value,
		status: row.status === "Critical" ? "Critical" : out ? "Warning" : "Normal",
	};
}

function getVisit(name, write = false) {
	const visit = visits.get(name);
	if (!visit) throw new ApiError(`Site Visit ${name} not found`, 404, "DoesNotExistError");
	if (write && !(visit.docstatus === 0 && EDITABLE.includes(visit.visit_status))) {
		throw new ApiError("You do not have permission to change this visit.", 403, "PermissionError");
	}
	return visit;
}

function applyData(visit, data = {}) {
	for (const field of ["executive_summary", "customer_representative", "customer_representative_phone"]) {
		if (field in data) visit[field] = data[field];
	}
	for (const incoming of data.checklist_items || []) {
		const row = visit.checklist_items.find((item) => item.name === incoming.name);
		if (row) Object.assign(row, { response: incoming.response || "", response_value: incoming.response_value ?? "", remarks: incoming.remarks || "" });
	}
	for (const table of TABLES) {
		if (!(table in data)) continue;
		visit[table] = (data[table] || []).map((row, index) => {
			let next = { name: row.name || `${table}-${++counter}`, idx: index + 1, ...row };
			if (table === "readings") next = classify(next);
			if (table === "requirements") next.supervisor_decision ||= "Pending";
			if (table === "actions") next.status ||= "Pending";
			return next;
		});
	}
	visit.modified = now();
}

function blockers(visit) {
	const problems = [];
	if (!visit.outcome) problems.push("Select the visit outcome.");
	else if (["Partially Resolved", "Not Resolved", "Follow-up Required", "Customer Unavailable"].includes(visit.outcome) && !(visit.executive_summary || "").trim()) {
		problems.push(`Add a summary explaining the outcome '${visit.outcome}'.`);
	}
	for (const row of visit.checklist_items) {
		if (row.is_mandatory && !row.response && !String(row.response_value ?? "").trim()) problems.push(`Answer the mandatory checklist item: ${row.checklist_item}`);
	}
	for (const row of visit.readings) if (!String(row.reading_value ?? "").trim()) problems.push(`Enter a value for the reading: ${row.parameter_name}`);
	if (visit.readings.length < visit.rules.min_readings) problems.push(`Record at least ${visit.rules.min_readings} reading(s) for this service type.`);
	if (visit.evidence.length < visit.rules.min_evidence_photos) problems.push(`Attach at least ${visit.rules.min_evidence_photos} photo(s) for this service type.`);
	if (visit.geofence_status === "Exception" && !(visit.geofence_reason || "").trim()) problems.push("Explain why the check-in location could not be verified.");
	return problems;
}

function payload(visit) {
	return {
		...visit,
		site: sites[visit.service_location] || visit._site || null,
		request: requests[visit.service_request] || undefined,
		has_signature: Boolean(visit.customer_signature),
		customer_signature: undefined,
		can_edit: visit.docstatus === 0 && EDITABLE.includes(visit.visit_status),
	};
}

function start(visit, args) {
	if (visit.visit_status !== "Planned") throw new ApiError(`Visit ${visit.name} is ${visit.visit_status} and cannot be started.`);
	const [status, meters] = geofence(visit, args.latitude, args.longitude);
	if (status === "Exception" && settings.require_reason_for_gps_exception && !(args.reason || "").trim()) {
		throw new ApiError("This check-in cannot be verified against the site location. Add a reason to continue.", 417, "GeofenceReasonRequired");
	}
	Object.assign(visit, {
		checkin_time: now(),
		checkin_latitude: hasGps(args.latitude, args.longitude) ? Number(args.latitude) : null,
		checkin_longitude: hasGps(args.latitude, args.longitude) ? Number(args.longitude) : null,
		checkin_accuracy: args.accuracy ?? null,
		geofence_status: status,
		distance_to_site_meters: meters,
		geofence_reason: args.reason || visit.geofence_reason || "",
		visit_status: "In Progress",
		modified: now(),
	});
}

/** Same contract as the server: one execution per key, the first result replayed afterwards. */
function idempotent(key, run) {
	if (key && syncLog.has(key)) return { ...syncLog.get(key), replayed: true };
	const result = run();
	if (key) syncLog.set(key, JSON.parse(JSON.stringify(result)));
	return result;
}

// -------------------------------------------------------------- endpoints
const api = {
	"cw_pwa.api.boot": (_args, session) =>
		session.user
			? {
					api_version: "1", user: USER, full_name: "Omar Hassan", user_image: null, language: "en",
					roles: ["CW Visit Engineer"], has_access: true, is_reviewer: false, employee: "EMP-0007", employee_name: "Omar Hassan",
					server_time: now(), settings, csrf_token: "mock-csrf-token", site_name: "mock.local",
				}
			: { user: "Guest", site_name: "mock.local" },

	login: (args, session) => {
		if (args.usr !== USER || args.pwd !== PASSWORD) throw new ApiError("Invalid login credentials", 401, "AuthenticationError");
		session.user = USER;
		return "Logged In";
	},
	logout: (_args, session) => {
		session.user = null;
		return {};
	},

	"cw_visit.api.v1.my_visits": () => ({
		visits: [...visits.values()]
			.sort((a, b) => b.planned_date.localeCompare(a.planned_date))
			.map((visit) => {
				const site = sites[visit.service_location] || visit._site;
				return {
					...Object.fromEntries(["name", "customer", "customer_name", "service_location", "service_request", "visit_type", "priority", "visit_status", "outcome", "creation_source", "planned_date", "planned_start_time", "planned_end_time", "checkin_time", "checkout_time", "geofence_status", "supervisor_decision", "modified"].map((key) => [key, visit[key] ?? null])),
					site: site ? { name: site.name, location_name: site.location_name, address_display: site.address_display, latitude: site.latitude, longitude: site.longitude } : null,
				};
			}),
		has_more: false,
		server_time: now(),
	}),
	"cw_visit.api.v1.visit": (args) => payload(getVisit(args.name)),
	"cw_visit.api.v1.masters": () => ({ ...masters, server_time: now() }),
	"cw_visit.api.v1.site_history": (args) => {
		const visit = getVisit(args.name);
		if (visit.service_location !== "LOC-NB-01") return [];
		return [{ name: "VISIT-2026-0031", planned_date: addDays(-30), visit_type: "Routine Water Inspection", outcome: "Resolved", engineer_name: "Omar Hassan", readings: [{ parameter: "PH-01", parameter_name: "pH", reading_value: "7.4", unit: "pH", status: "Normal" }, { parameter: "TDS-01", parameter_name: "Total Dissolved Solids (TDS)", reading_value: "310", unit: "ppm", status: "Normal" }] }];
	},
	"cw_visit.api.v1.search_customers": (args) => {
		const needle = String(args.query || "").toLowerCase();
		return needle.length < 2 ? [] : customers.filter((item) => item.customer_name.toLowerCase().includes(needle));
	},
	"cw_visit.api.v1.customer_locations": (args) => Object.values(sites).filter((site) => site.customer === args.customer),
	"cw_visit.api.v1.search_items": (args) => {
		const items = [{ name: "ITM-SEAL-12", item_name: "Dosing pump seal kit 12mm", stock_uom: "Nos" }, { name: "ITM-ANTISC-25", item_name: "Antiscalant 25 L drum", stock_uom: "Drum" }];
		const needle = String(args.query || "").toLowerCase();
		return needle.length < 2 ? [] : items.filter((item) => item.item_name.toLowerCase().includes(needle));
	},
	"cw_visit.api.v1.notifications": () => ({ items: alerts, unread: alerts.filter((item) => !item.read).length }),
	"cw_visit.api.v1.mark_notifications_read": () => {
		alerts.forEach((item) => (item.read = 1));
		return { ok: true };
	},

	"cw_visit.api.v1.start_visit": (args) =>
		idempotent(args.idempotency_key, () => {
			const visit = getVisit(args.name, true);
			start(visit, args);
			return { visit: visit.name, data: payload(visit) };
		}),
	"cw_visit.api.v1.save_draft": (args) =>
		idempotent(args.idempotency_key, () => {
			const visit = getVisit(args.name, true);
			applyData(visit, args.data);
			return { visit: visit.name, data: payload(visit) };
		}),
	"cw_visit.api.v1.submit_visit": (args) =>
		idempotent(args.idempotency_key, () => {
			const visit = getVisit(args.name, true);
			if (!["In Progress", "Correction Required"].includes(visit.visit_status)) throw new ApiError(`Visit ${visit.name} is ${visit.visit_status} and cannot be submitted for review.`);
			const before = JSON.stringify(visit);
			applyData(visit, args.data);
			visit.outcome = args.outcome || visit.outcome;
			if (args.executive_summary != null) visit.executive_summary = args.executive_summary;
			const problems = blockers(visit);
			if (problems.length) {
				Object.assign(visit, JSON.parse(before)); // a failed submit changes nothing
				throw new ApiError(problems.join("<br>"));
			}
			Object.assign(visit, {
				checkout_time: visit.checkout_time || now(),
				visit_duration_minutes: visit.visit_duration_minutes || 42,
				customer_representative: args.customer_representative || "",
				customer_signature: args.customer_signature || null,
				submitted_for_review_on: now(),
				supervisor_decision: null,
				visit_status: "Pending Review",
			});
			return { visit: visit.name, data: payload(visit) };
		}),
	"cw_visit.api.v1.upload_evidence": (args) =>
		idempotent(args.idempotency_key, () => {
			const visit = getVisit(args.name, true);
			if (!args._file) throw new ApiError("No file was uploaded.");
			const row = { name: `ev-${++counter}`, idx: visit.evidence.length + 1, file: `/files/mock-${counter}.jpg`, category: args.category || "Other", caption: args.caption || "", timestamp: now(), client_upload_id: args.idempotency_key };
			files.set(row.file, args._file);
			visit.evidence.push(row);
			return { visit: visit.name, row: row.name, file_url: row.file, evidence: visit.evidence };
		}),
	"cw_visit.api.v1.remove_evidence": (args) =>
		idempotent(args.idempotency_key, () => {
			const visit = getVisit(args.name, true);
			visit.evidence = visit.evidence.filter((row) => row.name !== args.row);
			return { visit: visit.name, evidence: visit.evidence };
		}),
	"cw_visit.api.v1.create_visit": (args) =>
		idempotent(args.idempotency_key, () => {
			const customer = customers.find((item) => item.name === args.customer);
			if (!customer) throw new ApiError("Unknown or disabled customer.", 404, "DoesNotExistError");
			let location = args.service_location || null;
			let proposedSite = null;
			if (!location && args.new_location) {
				if (!hasGps(args.latitude, args.longitude)) throw new ApiError("A GPS position is required to propose a new site.");
				location = `LOC-APP-${++counter}`;
				proposedSite = sites[location] = { name: location, location_name: args.new_location.location_name, customer: customer.name, latitude: Number(args.latitude), longitude: Number(args.longitude), geofence_radius_meters: 200, verification_status: "Pending Verification", address_display: args.new_location.address || "" };
			}
			const visit = makeVisit({ customer: customer.name, customer_name: customer.customer_name, service_location: location, visit_type: args.visit_type, priority: args.priority || "Medium", description: args.description || "", creation_source: "Engineer On-Site", _site: proposedSite });
			if (Number(args.start_now)) start(visit, args);
			return { visit: visit.name, data: payload(visit) };
		}),
};

// ----------------------------------------------------------------- server
const files = new Map();
const sessions = new Map();
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".json": "application/json", ".woff2": "font/woff2" };

function sessionFor(request, response) {
	const match = /cw_mock_sid=([\w-]+)/.exec(request.headers.cookie || "");
	let id = match?.[1];
	if (!id || !sessions.has(id)) {
		id = Math.random().toString(36).slice(2);
		sessions.set(id, { user: null });
		response.setHeader("Set-Cookie", `cw_mock_sid=${id}; Path=/; HttpOnly; SameSite=Lax`);
	}
	return sessions.get(id);
}

async function readBody(request) {
	const chunks = [];
	for await (const chunk of request) chunks.push(chunk);
	const buffer = Buffer.concat(chunks);
	const type = request.headers["content-type"] || "";
	if (type.includes("application/json")) return buffer.length ? JSON.parse(buffer.toString("utf8")) : {};
	if (type.includes("multipart/form-data")) return parseMultipart(buffer, type);
	return {};
}

function parseMultipart(buffer, type) {
	const boundary = `--${/boundary=(.+)$/.exec(type)[1]}`;
	const args = {};
	for (const part of buffer.toString("latin1").split(boundary)) {
		const name = /name="([^"]+)"/.exec(part)?.[1];
		if (!name) continue;
		const body = part.slice(part.indexOf("\r\n\r\n") + 4, part.lastIndexOf("\r\n"));
		if (/filename="/.test(part)) args._file = Buffer.from(body, "latin1");
		else args[name] = Buffer.from(body, "latin1").toString("utf8");
	}
	return args;
}

function send(response, status, body, headers = {}) {
	const text = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
	response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
	response.end(text);
}

const server = http.createServer(async (request, response) => {
	const url = new URL(request.url, `http://${request.headers.host}`);

	if (url.pathname.startsWith("/api/method/")) {
		const method = url.pathname.slice("/api/method/".length);
		const session = sessionFor(request, response);
		const handler = api[method];
		// A little latency makes loading states visible, like a real mobile network.
		await new Promise((done) => setTimeout(done, Number(process.env.LATENCY_MS) || 120));
		try {
			if (!handler) throw new ApiError(`Unknown method ${method}`, 404, "DoesNotExistError");
			if (!session.user && !["login", "cw_pwa.api.boot"].includes(method)) throw new ApiError("Not permitted", 403, "PermissionError");

			const args = request.method === "POST" ? await readBody(request) : {};
			for (const [key, value] of url.searchParams) {
				try {
					args[key] = JSON.parse(value);
				} catch {
					args[key] = value;
				}
			}
			if (request.method === "POST" && session.user && method !== "login" && request.headers["x-frappe-csrf-token"] !== "mock-csrf-token") {
				throw new ApiError("Invalid Request", 400, "CSRFTokenError");
			}
			return send(response, 200, { message: handler(args, session) });
		} catch (error) {
			const status = error.status || 500;
			if (status === 500) console.error(error);
			return send(response, status, { exc_type: error.excType || "Error", _server_messages: JSON.stringify([JSON.stringify({ message: error.message })]) });
		}
	}

	if (files.has(url.pathname)) return send(response, 200, files.get(url.pathname), { "Content-Type": "image/jpeg" });

	// Static files, with index.html for every in-app route.
	let file = join(DIST, decodeURIComponent(url.pathname));
	if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, "index.html");
	if (!existsSync(file)) return send(response, 500, "Run `npm run build:standalone` first.", { "Content-Type": "text/plain" });
	response.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
	createReadStream(file).pipe(response);
});

server.listen(PORT, () => console.log(`Mock ERPNext on http://localhost:${PORT}  (sign in: ${USER} / ${PASSWORD})`));
