/** Display formatting. Server datetimes are "YYYY-MM-DD HH:MM:SS" in the site's time zone. */
import { locale, t } from "./i18n";

export function parseDate(value) {
	if (!value) return null;
	if (value instanceof Date) return value;
	const date = new Date(String(value).replace(" ", "T"));
	return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function todayISO() {
	const now = new Date();
	const pad = (n) => String(n).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "Today", "Tomorrow", "Yesterday", or "Mon 6 Oct". */
export function dayLabel(value) {
	const date = parseDate(value);
	if (!date) return "";
	const days = Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000);
	if (days === 0) return t("Today");
	if (days === 1) return t("Tomorrow");
	if (days === -1) return t("Yesterday");
	return date.toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" });
}

/** "09:30" from a server time ("9:30:00") or datetime. */
export function timeLabel(value) {
	if (!value) return "";
	const text = String(value);
	const match = text.match(/(\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?$/);
	if (match && !text.includes("-")) return `${match[1].padStart(2, "0")}:${match[2]}`;
	const date = parseDate(value);
	return date ? date.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) : "";
}

export function dateTimeLabel(value) {
	const date = parseDate(value);
	if (!date) return "";
	return `${dayLabel(date)} ${timeLabel(date)}`;
}

/** "just now", "14 min ago", "3 h ago", then a date. */
export function ago(value) {
	const date = typeof value === "number" ? new Date(value) : parseDate(value);
	if (!date) return "";
	const minutes = Math.round((Date.now() - date.getTime()) / 60000);
	if (minutes < 1) return t("just now");
	if (minutes < 60) return t("{n} min ago", { n: minutes });
	if (minutes < 60 * 24) return t("{n} h ago", { n: Math.round(minutes / 60) });
	return dayLabel(date);
}

export function durationLabel(minutes) {
	const total = Math.round(Number(minutes) || 0);
	if (total < 60) return t("{n} min", { n: total });
	return t("{h} h {m} min", { h: Math.floor(total / 60), m: String(total % 60).padStart(2, "0") });
}

export function distanceLabel(meters) {
	if (meters === null || meters === undefined) return "";
	const value = Number(meters);
	return value < 1000 ? t("{n} m", { n: Math.round(value) }) : t("{n} km", { n: (value / 1000).toFixed(1) });
}

export function initials(name) {
	return String(name || "?")
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0].toUpperCase())
		.join("");
}

/** Presentation for a visit status: label, tone (a colour token family) and whether it is done. */
export const STATUS = {
	Planned: { label: "Planned", tone: "info" },
	"In Progress": { label: "In progress", tone: "warn" },
	"Pending Review": { label: "In review", tone: "review" },
	"Correction Required": { label: "Needs correction", tone: "bad" },
	Approved: { label: "Approved", tone: "ok" },
	"Follow-up Required": { label: "Follow-up", tone: "warn" },
	Rejected: { label: "Rejected", tone: "bad" },
	Cancelled: { label: "Cancelled", tone: "muted" },
};

export const PRIORITY_TONE = { Low: "muted", Medium: "info", High: "warn", Critical: "bad" };
export const GEOFENCE_TONE = { Verified: "ok", Warning: "warn", Exception: "bad", "Not Evaluated": "muted" };
export const READING_TONE = { Normal: "ok", Warning: "warn", Critical: "bad" };
export const SEVERITY_TONE = { Info: "info", Minor: "muted", Major: "warn", Critical: "bad" };
