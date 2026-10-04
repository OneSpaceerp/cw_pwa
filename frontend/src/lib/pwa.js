/** Service worker registration, the update lifecycle, install prompts and storage. */
import { reactive } from "vue";

const UPDATE_CHECK_MS = 60 * 60 * 1000;
const INSTALL_DISMISSED_KEY = "cw:install-dismissed";

export const pwa = reactive({
	updateReady: false,
	canInstall: false,
	installed: isStandalone(),
	isIos: /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
});

let registration = null;
let deferredPrompt = null;
let updateRequested = false;
let reloading = false;

export function isStandalone() {
	return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export async function initPwa() {
	window.addEventListener("beforeinstallprompt", (event) => {
		event.preventDefault();
		deferredPrompt = event;
		pwa.canInstall = true;
	});
	window.addEventListener("appinstalled", () => {
		deferredPrompt = null;
		pwa.canInstall = false;
		pwa.installed = true;
	});

	if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;

	try {
		registration = await navigator.serviceWorker.register(__SW_URL__, { scope: __APP_BASE__ || "/" });
	} catch (error) {
		console.warn("Service worker registration failed", error);
		return;
	}

	// A worker that finishes installing while another one controls the page is an update.
	const watch = (worker) => {
		if (!worker) return;
		worker.addEventListener("statechange", () => {
			if (worker.state === "installed" && navigator.serviceWorker.controller) pwa.updateReady = true;
		});
	};
	if (registration.waiting && navigator.serviceWorker.controller) pwa.updateReady = true;
	watch(registration.installing);
	registration.addEventListener("updatefound", () => watch(registration.installing));

	// The controller also changes on the very first install, when the new worker
	// claims the page. Reloading then would wipe whatever the engineer was typing,
	// so only reload for an update they asked for.
	navigator.serviceWorker.addEventListener("controllerchange", () => {
		if (!updateRequested || reloading) return;
		reloading = true;
		window.location.reload();
	});

	// An installed app has no navigations to trigger update checks, so ask on a timer
	// and whenever it comes back to the foreground.
	const check = () => registration.update().catch(() => {});
	setInterval(check, UPDATE_CHECK_MS);
	document.addEventListener("visibilitychange", () => !document.hidden && check());

	navigator.storage?.persist?.().catch(() => {});
}

/** Switch to the waiting version. The page reloads once the new worker takes control. */
export function applyUpdate() {
	updateRequested = true;
	if (registration?.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
	else window.location.reload();
}

export function installDismissed() {
	try {
		return localStorage.getItem(INSTALL_DISMISSED_KEY) === "1";
	} catch {
		return false;
	}
}

export function dismissInstall() {
	try {
		localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
	} catch {
		// storage blocked - the prompt may simply show again
	}
}

/** Returns true if the app was installed. On iOS there is no prompt; the caller shows instructions. */
export async function promptInstall() {
	if (!deferredPrompt) return false;
	deferredPrompt.prompt();
	const { outcome } = await deferredPrompt.userChoice;
	deferredPrompt = null;
	pwa.canInstall = false;
	if (outcome !== "accepted") dismissInstall();
	return outcome === "accepted";
}

/** Remove everything that belongs to the signed-in user from this device. */
export async function purgeDeviceCaches() {
	if (!("caches" in window)) return;
	for (const name of await caches.keys()) {
		// Keep the precached app shell assets; they hold no user data.
		if (!name.startsWith("workbox-precache")) await caches.delete(name);
	}
}

export async function storageEstimate() {
	try {
		const { usage = 0, quota = 0 } = (await navigator.storage?.estimate?.()) || {};
		return { usage, quota };
	} catch {
		return { usage: 0, quota: 0 };
	}
}
