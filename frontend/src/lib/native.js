/**
 * The native (iOS / Android) app: what differs from the web app.
 *
 * The web app is served by ERPNext and signs in with the browser session cookie. The
 * native app ships its own copy of these files and talks to the ERPNext site at
 * __NATIVE_SERVER__ with a device token (see cw_pwa/native.py), kept in the phone's
 * preferences storage so it survives the WebView clearing its data.
 *
 * Every plugin is loaded on demand, so the web build never runs native code.
 */
import { Capacitor } from "@capacitor/core";

const TOKEN_KEY = "cw.device-token";
const SERVER_KEY = "cw.server";

export const isNative = () => __NATIVE__ && Capacitor.isNativePlatform();
export const platform = () => (isNative() ? Capacitor.getPlatform() : "web"); // "android" | "ios" | "web"

const state = { token: "", server: __NATIVE_SERVER__ };

// Returns the module, not the plugin: a Capacitor plugin is a proxy that answers every
// property, including "then", so returning it from an async function breaks the await.
async function preferencesModule() {
	return import("@capacitor/preferences");
}

/** Load the stored token and server before the first request. */
export async function initNative() {
	if (!isNative()) return;
	const store = (await preferencesModule()).Preferences;
	state.token = (await store.get({ key: TOKEN_KEY })).value || "";
	state.server = (await store.get({ key: SERVER_KEY })).value || __NATIVE_SERVER__;
}

export const deviceToken = () => state.token;
export const serverUrl = () => state.server;

export async function setDeviceToken(token) {
	state.token = token || "";
	const store = (await preferencesModule()).Preferences;
	if (state.token) await store.set({ key: TOKEN_KEY, value: state.token });
	else await store.remove({ key: TOKEN_KEY });
}

/** Another ERPNext site (e.g. a test site). Signs the phone out of the previous one. */
export async function setServerUrl(url) {
	const clean = String(url || "").trim().replace(/\/+$/, "");
	state.server = clean || __NATIVE_SERVER__;
	const store = (await preferencesModule()).Preferences;
	await store.set({ key: SERVER_KEY, value: state.server });
}

/** A file on the server (photos, attachments) as an absolute URL. */
export function serverFileUrl(path) {
	if (!path || /^(https?:|blob:|data:)/.test(path)) return path;
	return `${state.server}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Name and platform sent at sign-in, shown to administrators on CW App Device. */
export function deviceInfo() {
	const ua = navigator.userAgent || "";
	const model = ua.match(/\(([^)]+)\)/)?.[1]?.split(";").map((part) => part.trim()).filter(Boolean).pop() || "";
	return {
		platform: platform() === "ios" ? "iOS" : platform() === "android" ? "Android" : "",
		device_name: model.slice(0, 140),
		app_version: __APP_VERSION__,
	};
}

/**
 * A server path from a notification (e.g. "/cw/visits/VISIT-1") as an in-app route.
 * The native app has no "/cw" prefix.
 */
export function appRouteFromServerUrl(url) {
	const path = String(url || "/").replace(/^https?:\/\/[^/]+/, "");
	return path.replace(/^\/cw(?=\/|$)/, "") || "/";
}
