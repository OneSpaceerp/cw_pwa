import "./style.css";

import { createApp } from "vue";

import App from "./App.vue";
import { initPwa } from "./lib/pwa";
import router from "./router";
import { canUseApp, initSession, session } from "./stores/session";
import { loadDeviceData, syncNow } from "./stores/sync";

const SYNC_INTERVAL_MS = 45000;

trackKeyboard();

async function start() {
	await initSession().catch((error) => console.error("Could not start a session", error));
	session.ready = true;

	if (canUseApp()) await loadDeviceData();

	createApp(App).use(router).mount("#app");
	initPwa();

	// The outbox is flushed whenever there is a reason to believe it can get through.
	window.addEventListener("online", syncNow);
	document.addEventListener("visibilitychange", () => !document.hidden && syncNow());
	setInterval(syncNow, SYNC_INTERVAL_MS);
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
