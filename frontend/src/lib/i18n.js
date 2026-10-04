/**
 * Translation. English text is the key: t("Sign in") returns the Arabic when the
 * app is in Arabic and has a translation, and the English otherwise.
 *
 * Template text is translated automatically at compile time (see
 * scripts/i18n-plugin.mjs). Call t() yourself for text built in JavaScript and for
 * values that arrive from the server (statuses, option lists).
 *
 * Names kept in ERPNext - customers, sites, service types, parameters - are data
 * and are shown as they were entered.
 */
import { reactive } from "vue";

import ar from "../locales/ar.js";

const STORAGE_KEY = "cw:lang";
const DICTIONARIES = { ar };
const RTL = new Set(["ar"]);

export const LANGUAGES = [
	{ code: "en", label: "English" },
	{ code: "ar", label: "العربية" },
];

export const i18n = reactive({ lang: "en" });

/** `params` fills {name} placeholders: t("{count} to sync", { count: 3 }). */
export function t(text, params) {
	// Templates pass every value through here; only text can have a translation.
	if (typeof text !== "string") return text;
	// Reading i18n.lang makes every caller re-render when the language changes.
	const dictionary = DICTIONARIES[i18n.lang];
	const translated = dictionary?.[text] ?? text;
	// A test hook: lists text that reached the screen without a translation.
	if (dictionary && translated === text && typeof window !== "undefined" && window.__cwCollectMissing) {
		window.__cwCollectMissing.add(text);
	}
	if (!params) return translated;
	return translated.replace(/\{(\w+)\}/g, (match, name) => (name in params ? params[name] : match));
}

export const isRtl = () => RTL.has(i18n.lang);

/** Locale for dates and times. Western digits in both languages, so readings and ids match ERPNext. */
export const locale = () => (i18n.lang === "ar" ? "ar-EG-u-nu-latn" : undefined);

export function setLanguage(lang, { remember = true } = {}) {
	i18n.lang = DICTIONARIES[lang] ? lang : "en";
	document.documentElement.lang = i18n.lang;
	document.documentElement.dir = isRtl() ? "rtl" : "ltr";
	if (remember) {
		try {
			localStorage.setItem(STORAGE_KEY, i18n.lang);
		} catch {
			// storage blocked - the choice lasts for this session only
		}
	}
}

/**
 * Pick the starting language: what the engineer chose on this phone, else their
 * ERPNext language, else the phone's.
 */
export function initLanguage(serverLanguage) {
	let stored = null;
	try {
		stored = localStorage.getItem(STORAGE_KEY);
	} catch {
		stored = null;
	}
	const guess = stored || serverLanguage || navigator.language || "en";
	setLanguage(String(guess).toLowerCase().startsWith("ar") ? "ar" : "en", { remember: false });
}
