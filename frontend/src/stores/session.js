/** Who is signed in, and whether the server is reachable. */
import { reactive } from "vue";

import { BOOT_METHOD, call, onSessionLost, post, setCsrfToken } from "@/lib/api";
import * as db from "@/lib/db";
import { initLanguage } from "@/lib/i18n";
import { configurePush, subscribeToPush, unsubscribeFromPush } from "@/lib/permissions";
import { purgeDeviceCaches } from "@/lib/pwa";

const BOOT_KEY = "boot";

export const session = reactive({
	ready: false,
	/** Boot payload from the server, or the last one seen when starting offline. */
	boot: null,
	/** True while running on a cached boot because the server could not be reached. */
	offlineStart: false,
	online: navigator.onLine,
});

export const isSignedIn = () => Boolean(session.boot?.user && session.boot.user !== "Guest");
export const canUseApp = () => isSignedIn() && Boolean(session.boot.has_access && session.boot.employee);
export const settings = () => session.boot?.settings || {};

window.addEventListener("online", () => (session.online = true));
window.addEventListener("offline", () => (session.online = false));

onSessionLost(() => {
	if (!session.boot) return;
	session.boot = null;
	// Keep local visit data and the outbox: the same engineer signing back in continues.
	window.dispatchEvent(new CustomEvent("cw:signed-out"));
});

export async function initSession() {
	try {
		await applyBoot(await call(BOOT_METHOD));
	} catch (error) {
		if (!error.network) throw error;
		// No server: carry on as the engineer who last used this device, read-only until sync.
		const cached = await db.get("kv", BOOT_KEY);
		session.boot = cached || null;
		session.offlineStart = Boolean(cached);
	}
	session.ready = true;
}

async function applyBoot(boot) {
	session.offlineStart = false;
	if (!boot || boot.user === "Guest") {
		session.boot = null;
		return;
	}

	setCsrfToken(boot.csrf_token);
	const { csrf_token: _token, ...publicBoot } = boot;

	// A different person on a shared phone must never see the previous one's data.
	const previous = await db.get("kv", BOOT_KEY);
	if (previous && previous.user !== boot.user) {
		await db.clearAll();
		await purgeDeviceCaches();
	}
	await db.put("kv", publicBoot, BOOT_KEY);
	session.boot = publicBoot;

	initLanguage(publicBoot.language);
	// Keep this phone registered for alerts. A no-op until notifications are allowed.
	configurePush(publicBoot.push_public_key);
	subscribeToPush();
}

export async function login(username, password) {
	await post("login", { usr: username, pwd: password });
	// Logging in starts a new server session with a new CSRF token.
	await applyBoot(await call(BOOT_METHOD));
	session.ready = true;
}

/** Sign out and remove this user's data from the device. */
export async function logout() {
	// While still signed in: stop alerts for this person reaching this phone.
	await unsubscribeFromPush();
	try {
		await post("logout");
	} catch {
		// Offline or already signed out: still clear the device.
	}
	await db.clearAll();
	await purgeDeviceCaches();
	session.boot = null;
	setCsrfToken("");
}

/**
 * Re-read boot info from the server: roles, settings and a fresh CSRF token.
 * Needed after starting offline, when the app is running on remembered boot info
 * and has no token to write with yet.
 */
export async function refreshBoot() {
	const wasSignedIn = isSignedIn();
	try {
		await applyBoot(await call(BOOT_METHOD));
	} catch {
		return; // still unreachable - keep what we have
	}
	// The session ended on the server while the phone was offline.
	if (wasSignedIn && !isSignedIn()) window.dispatchEvent(new CustomEvent("cw:signed-out"));
}
