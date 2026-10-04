// Unit tests for the client-side rule copies:  npm test
// They mirror cw_visit/tests/test_rules.py so the phone's guidance cannot drift
// from what the server enforces.
import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyReading, evaluateGeofence, hasCoordinates, haversine, reviewBlockers } from "../src/lib/rules.js";

const SITE = { latitude: 29.972, longitude: 30.941, geofence_radius_meters: 200, verification_status: "Verified" };
const SETTINGS = { default_geofence_radius_meters: 200, warning_buffer_meters: 300, require_reason_for_gps_exception: 1 };

test("coordinates: missing, zero and out-of-range values are not a position", () => {
	assert.equal(hasCoordinates(null, null), false);
	assert.equal(hasCoordinates(0, 0), false);
	assert.equal(hasCoordinates("", ""), false);
	assert.equal(hasCoordinates(91, 30), false);
	assert.equal(hasCoordinates("abc", 30), false);
	assert.equal(hasCoordinates(29.972, 30.941), true);
	assert.equal(hasCoordinates(0, 30.9), true);
});

test("haversine: one millidegree of latitude is about 111 m", () => {
	assert.ok(Math.abs(haversine(29.972, 30.941, 29.973, 30.941) - 111.2) < 1);
});

test("geofence: verified inside the radius, warning in the buffer, exception beyond", () => {
	assert.equal(evaluateGeofence({ latitude: 29.9722, longitude: 30.941 }, SITE, SETTINGS).status, "Verified");
	assert.equal(evaluateGeofence({ latitude: 29.975, longitude: 30.941 }, SITE, SETTINGS).status, "Warning");
	assert.equal(evaluateGeofence({ latitude: 29.99, longitude: 30.941 }, SITE, SETTINGS).status, "Exception");
});

test("geofence: no position is an exception; a site without coordinates is only a warning", () => {
	assert.deepEqual(evaluateGeofence(null, SITE, SETTINGS), { status: "Exception", distance: null });
	assert.deepEqual(evaluateGeofence({ latitude: 29.97, longitude: 30.94 }, { latitude: 0, longitude: 0 }, SETTINGS), {
		status: "Warning",
		distance: null,
	});
	assert.equal(evaluateGeofence({ latitude: 29.97, longitude: 30.94 }, null, SETTINGS).status, "Warning");
});

test("geofence: an unverified site is never verified, even at zero distance", () => {
	const site = { ...SITE, verification_status: "Pending Verification" };
	assert.deepEqual(evaluateGeofence({ latitude: SITE.latitude, longitude: SITE.longitude }, site, SETTINGS), {
		status: "Warning",
		distance: 0,
	});
});

test("readings: range decides, the engineer can only escalate", () => {
	assert.equal(classifyReading("7.2", 6.5, 8.5), "Normal");
	assert.equal(classifyReading("9.5", 6.5, 8.5), "Warning");
	assert.equal(classifyReading(4, 6.5, 8.5), "Warning");
	assert.equal(classifyReading("9.5", 6.5, 8.5, "Float", "Normal"), "Warning");
	assert.equal(classifyReading("7.0", 6.5, 8.5, "Float", "Critical"), "Critical");
});

test("readings: no range, zero-based ranges and text parameters", () => {
	assert.equal(classifyReading("123", 0, 0), "Normal");
	assert.equal(classifyReading("3", 0, 5), "Normal");
	assert.equal(classifyReading("6", 0, 5), "Warning");
	assert.equal(classifyReading("clear", 0, 5, "Text"), "Normal");
	assert.equal(classifyReading("n/a", 6.5, 8.5), "Normal");
});

const visit = (overrides = {}) => ({
	checklist_items: [{ checklist_item: "Check pumps", is_mandatory: 1, response: "Pass" }],
	readings: [{ parameter: "PH-01", reading_value: "7.1" }],
	rules: { min_readings: 1, min_evidence_photos: 1 },
	geofence_status: "Verified",
	geofence_reason: "",
	...overrides,
});
const blockers = (data, options = {}) =>
	reviewBlockers(data, { outcome: "Resolved", summary: "", photoCount: 1, settings: SETTINGS, ...options });

test("review: a complete visit has nothing blocking it", () => {
	assert.deepEqual(blockers(visit()), []);
});

test("review: outcome, and a summary for unresolved outcomes", () => {
	assert.equal(blockers(visit(), { outcome: "" }).length, 1);
	assert.equal(blockers(visit(), { outcome: "Not Resolved" }).length, 1);
	assert.equal(blockers(visit(), { outcome: "Not Resolved", summary: "Pump seized" }).length, 0);
});

test("review: mandatory checklist items, blank readings, minimum counts", () => {
	assert.equal(blockers(visit({ checklist_items: [{ checklist_item: "x", is_mandatory: 1, response: "" }] })).length, 1);
	assert.equal(blockers(visit({ checklist_items: [{ checklist_item: "x", is_mandatory: 0, response: "" }] })).length, 0);
	assert.equal(blockers(visit({ checklist_items: [{ checklist_item: "x", is_mandatory: 1, response: "", response_value: "3.5" }] })).length, 0);
	assert.equal(blockers(visit({ readings: [{ parameter: "PH-01", reading_value: " " }] })).length, 1);
	assert.equal(blockers(visit({ readings: [] })).length, 1);
	assert.equal(blockers(visit(), { photoCount: 0 }).length, 1);
});

test("review: a GPS exception needs its reason when policy says so", () => {
	assert.equal(blockers(visit({ geofence_status: "Exception" })).length, 1);
	assert.equal(blockers(visit({ geofence_status: "Exception", geofence_reason: "No signal" })).length, 0);
	assert.equal(blockers(visit({ geofence_status: "Exception" }), { settings: {} }).length, 0);
});

test("review: each problem points at the step that fixes it", () => {
	const problems = blockers(visit({ readings: [], checklist_items: [{ checklist_item: "x", is_mandatory: 1, response: "" }] }), {
		outcome: "",
		photoCount: 0,
	});
	assert.deepEqual(problems.map((item) => item.step).sort(), ["checklist", "photos", "readings", "review"]);
});
