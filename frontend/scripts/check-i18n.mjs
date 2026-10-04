/**
 * Lists text that has no Arabic translation:  npm run i18n:check
 *
 * Run a build first: template text is collected by the compiler plugin during the
 * build. Text used from JavaScript is found here by pattern. Add `--all` to print
 * every string instead of only the missing ones.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const extractedFile = join(root, "node_modules/.cw-i18n-strings.json");

if (!existsSync(extractedFile)) {
	console.error("Run `npm run build` first: template text is collected during the build.");
	process.exit(2);
}

const found = new Set(JSON.parse(readFileSync(extractedFile, "utf8")));
const WORD = /[A-Za-z]{2}/;
const add = (text) => text && WORD.test(text) && found.add(text.replace(/\\(["'])/g, "$1"));

// Text in JavaScript: t("..."), and plain strings in the places that reach the screen.
const PATTERNS = [
	/\bt\(\s*"((?:[^"\\]|\\.)*)"/g,
	/\bt\(\s*'((?:[^'\\]|\\.)*)'/g,
	/\b(?:label|title|why|text|message|confirmLabel|cancelLabel|placeholder|hint|noun|heading|emptyText):\s*"((?:[^"\\]|\\.)*)"/g,
	/\b(?:new Error|new ApiError|toast|toastError)\(\s*"((?:[^"\\]|\\.)*)"/g,
	/[?:]\s*"((?:[^"\\]|\\.)*[A-Za-z]{2}(?:[^"\\]|\\.)*)"/g,
	/[?:]\s*'((?:[^'\\]|\\.)*[A-Za-z]{2}(?:[^'\\]|\\.)*)'/g,
];

// Strings those patterns catch that are code, not text for people.
const IGNORE = [
	/[\n\t]/,
	/^(?:GET|POST|RouterLink|SKIP_WAITING|C-WATER|English)$/,
	/[;{}[\]=]/,
	/^\)/,
	/^\/[\w:/.*?()-]*$/,
	/-u-nu-/,
	/^[a-z-]+(?: [a-z0-9-]+)+$/,
	/^[a-z0-9_.:/-]+$/,
	/^cw[_:]/,
	/^\.\.?\//,
	/^#/,
	/^tone-/,
	/^[A-Z]{2,}-\d/,
	/\b(?:px|rem|ms)\b/,
	/^(?:bg|text|border|min-h|rounded|flex|grid|absolute|pt|var|calc)[-(]/,
];
// Values that come from ERPNext and are shown through $t(): statuses and option lists.
const SERVER_VALUES = [
	"Planned", "In Progress", "Pending Review", "Correction Required", "Approved", "Follow-up Required", "Rejected", "Cancelled",
	"Resolved", "Partially Resolved", "Not Resolved", "Customer Unavailable",
	"Low", "Medium", "High", "Critical", "Info", "Minor", "Major", "Normal", "Warning", "Urgent", "Emergency",
	"Verified", "Exception", "Not Evaluated", "Pending", "Pending Verification",
	"Pass", "Fail", "N/A", "Yes", "No",
	"Successful", "Partially Successful", "Incomplete", "Failed",
	"Before Inspection", "During Operation", "After Operation", "Defect / Leak", "Meter / Gauge", "Customer Acknowledgement", "Expense Receipt", "Other",
	"Travel / Transportation", "Fuel", "Meals", "Lodging", "Materials / Hardware",
	"In Progress", "Completed",
];
SERVER_VALUES.forEach((value) => found.add(value));
["finding", "work item", "request", "expense", "follow-up", "contact", "answered", "of", "to", "unread"].forEach((value) => found.add(value));
const KEEP = new Set(["work item", "just now", "to fix", "to sync", "has items to finish"]);

(function walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const file = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== "locales") walk(file);
		} else if (/\.(vue|js)$/.test(entry.name)) {
			const source = readFileSync(file, "utf8");
			for (const pattern of PATTERNS) for (const match of source.matchAll(pattern)) add(match[1]);
		}
	}
})(join(root, "src"));

const strings = [...found].filter((text) => KEEP.has(text) || !IGNORE.some((pattern) => pattern.test(text))).sort();
const { default: ar } = await import(pathToFileURL(join(root, "src/locales/ar.js")));

if (process.argv.includes("--all")) {
	console.log(strings.join("\n"));
	process.exit(0);
}

const missing = strings.filter((text) => !(text in ar));
const unused = Object.keys(ar).filter((key) => !found.has(key));
console.log(`${strings.length} strings, ${missing.length} without Arabic, ${unused.length} translations not referenced`);
if (missing.length) console.log("\nMissing:\n" + missing.map((text) => "  " + JSON.stringify(text)).join("\n"));
if (process.argv.includes("--unused") && unused.length) {
	console.log("\nNot referenced (may be used through a server value):\n" + unused.map((text) => "  " + JSON.stringify(text)).join("\n"));
}
process.exit(missing.length ? 1 : 0);
