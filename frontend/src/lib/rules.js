/**
 * Client-side copies of the visit rules, used only to guide the engineer before a
 * round-trip (and while offline). The server re-checks everything in
 * cw_visit/rules.py and its answer is the one that counts.
 */

import { t } from "./i18n.js";

const EARTH_RADIUS_M = 6371000;
const SEVERITY = { Normal: 0, Warning: 1, Critical: 2 };

export const EDITABLE_STATUSES = ["Planned", "In Progress", "Correction Required"];
export const OUTCOMES_NEEDING_SUMMARY = ["Partially Resolved", "Not Resolved", "Follow-up Required", "Customer Unavailable"];

export function toNumber(value) {
	if (value === null || value === undefined || typeof value === "boolean") return null;
	const text = String(value).trim();
	if (!text) return null;
	const number = Number(text);
	return Number.isFinite(number) ? number : null;
}

export function hasCoordinates(latitude, longitude) {
	const lat = toNumber(latitude);
	const lon = toNumber(longitude);
	if (lat === null || lon === null) return false;
	if (lat === 0 && lon === 0) return false;
	return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function haversine(lat1, lon1, lat2, lon2) {
	const rad = (degrees) => (degrees * Math.PI) / 180;
	const a =
		Math.sin(rad(lat2 - lat1) / 2) ** 2 +
		Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
	return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Same classification as the server: { status, distance }. */
export function evaluateGeofence(position, site, settings = {}) {
	if (!position || !hasCoordinates(position.latitude, position.longitude)) {
		return { status: "Exception", distance: null };
	}
	if (!site || !hasCoordinates(site.latitude, site.longitude)) {
		return { status: "Warning", distance: null };
	}
	const distance =
		Math.round(haversine(position.latitude, position.longitude, Number(site.latitude), Number(site.longitude)) * 100) / 100;
	const radius = toNumber(site.geofence_radius_meters) || toNumber(settings.default_geofence_radius_meters) || 200;
	const buffer = toNumber(settings.warning_buffer_meters) || 0;
	const verifiedSite = site.verification_status !== "Pending Verification";

	if (distance <= radius) return { status: verifiedSite ? "Verified" : "Warning", distance };
	if (distance <= radius + buffer) return { status: "Warning", distance };
	return { status: "Exception", distance };
}

export function classifyReading(value, min, max, dataType = "Float", reported = "Normal") {
	const reportedStatus = reported in SEVERITY ? reported : "Normal";
	if (!["Float", "Int"].includes(dataType)) return reportedStatus;

	const number = toNumber(value);
	if (number === null) return reportedStatus;

	const low = toNumber(min) || 0;
	const high = toNumber(max) || 0;
	const hasRange = !(low === 0 && high === 0);
	const computed = hasRange && (number < low || number > high) ? "Warning" : "Normal";
	return SEVERITY[computed] >= SEVERITY[reportedStatus] ? computed : reportedStatus;
}

/** What still has to be done before a visit can go for review. Each item names the step to fix it in. */
export function reviewBlockers(visit, { outcome, summary, photoCount, settings = {} }) {
	const problems = [];
	const rules = visit.rules || {};

	if (!outcome) {
		problems.push({ step: "review", text: t("Select the visit outcome.") });
	} else if (OUTCOMES_NEEDING_SUMMARY.includes(outcome) && !(summary || "").trim()) {
		problems.push({ step: "review", text: t("Add a summary explaining the outcome: {outcome}.", { outcome: t(outcome) }) });
	}

	for (const row of visit.checklist_items || []) {
		const answered = (row.response || "").trim() || String(row.response_value ?? "").trim();
		if (row.is_mandatory && !answered) {
			problems.push({ step: "checklist", text: t("Answer: {item}", { item: row.checklist_item }) });
		}
	}

	for (const row of visit.readings || []) {
		if (!String(row.reading_value ?? "").trim()) {
			problems.push({ step: "readings", text: t("Enter a value for {name}.", { name: row.parameter_name || row.parameter }) });
		}
	}

	const minReadings = Number(rules.min_readings) || 0;
	if ((visit.readings || []).length < minReadings) {
		problems.push({ step: "readings", text: t("Record at least {n} reading(s) for this service type.", { n: minReadings }) });
	}

	const minPhotos = Number(rules.min_evidence_photos) || 0;
	if (photoCount < minPhotos) {
		problems.push({ step: "photos", text: t("Attach at least {n} photo(s) for this visit.", { n: minPhotos }) });
	}

	if (
		settings.require_reason_for_gps_exception &&
		visit.geofence_status === "Exception" &&
		!(visit.geofence_reason || "").trim()
	) {
		problems.push({ step: "review", text: t("Explain why the check-in location could not be verified.") });
	}

	return problems;
}
