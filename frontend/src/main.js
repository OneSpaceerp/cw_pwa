import "./style.css";

import { createApp } from "vue";

import App from "./App.vue";
import { initLanguage, t } from "./lib/i18n";
import { initPwa } from "./lib/pwa";
import router from "./router";
import { canUseApp, initSession, session } from "./stores/session";
import { loadAlerts } from "./stores/alerts";
import { loadDeviceData, syncNow } from "./stores/sync";

const SYNC_INTERVAL_MS = 45000;
const SPLASH_MIN_MS = 1400;
const started = performance.now();

trackKeyboard();

async function start() {
	await initSession().catch((error) => console.error("Could not start a session", error));
	session.ready = true;

	if (canUseApp()) await loadDeviceData();

	initLanguage(session.boot?.language);

	const app = createApp(App);
	// Compiled templates call $t() for every piece of static text.
	app.config.globalProperties.$t = t;
	app.use(router);
	await router.isReady();
	await hideSplash();
	app.mount("#app");
	initPwa();

	// The outbox is flushed whenever there is a reason to believe it can get through.
	window.addEventListener("online", syncNow);
	document.addEventListener("visibilitychange", () => !document.hidden && syncNow());
	setInterval(refresh, SYNC_INTERVAL_MS);
}

/** Sync, and pick up new alerts while the app is open. */
function refresh() {
	if (document.hidden) return;
	syncNow();
	if (canUseApp()) loadAlerts();
}

/**
 * The launch animation plays in index.html before any JavaScript arrives. Let it
 * finish its entrance, then fade it out as the app takes over.
 */
async function hideSplash() {
	const splash = document.getElementById("boot-splash");
	if (!splash) return;
	const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const wait = reduced ? 0 : Math.max(0, SPLASH_MIN_MS - (performance.now() - started));
	await new Promise((resolve) => setTimeout(resolve, wait));
	splash.classList.add("is-leaving");
	setTimeout(() => splash.remove(), 450);
}

/**
 * iOS lays the keyboard over the page instead of resizing it. Publish the covered
 * height as a CSS variable so bottom bars can lift themselves clear.
 */
function trackKeyboard() {
	const viewport = window.visualViewport;
	if (!viewport) return;

	let frame = 0;
	const update = () => {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
			document.documentElement.style.setProperty("--keyboard-inset", `${inset}px`);
			// Above ~80px it is a keyboard, not an address bar collapsing.
			document.documentElement.classList.toggle("keyboard-open", inset > 80);
		});
	};
	viewport.addEventListener("resize", update);
	viewport.addEventListener("scroll", update);
}

start();
