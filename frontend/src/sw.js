/* Service worker for C-Water Visits.
 *
 * What it does:  makes the app start offline and keeps evidence images available.
 * What it does not do:  cache API responses or queue writes. Visit data and the
 * outbox live in IndexedDB, owned by the app, where failures can be shown to the
 * engineer. A cached write would be a correctness bug.
 */
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";

const SHELL_CACHE = "cw-shell";
const FILES_CACHE = "cw-files";
const NAVIGATION_TIMEOUT_MS = 3500;

// "/cw" when served by ERPNext, "/" in the standalone build.
const scopePath = new URL(self.registration.scope).pathname;
const shellKey = new URL(scopePath, self.location.origin).href;

// The injected precache list. Its URLs are absolute (see modifyURLPrefix in vite.config.js).
const precacheEntries = self.__WB_MANIFEST;
const precachedIndex = precacheEntries
	.map((entry) => (typeof entry === "string" ? entry : entry.url))
	.find((url) => url.endsWith("index.html"));

precacheAndRoute(precacheEntries);
cleanupOutdatedCaches();

// The API (including login and logout) is deliberately NOT routed here. With no
// matching route the worker does not touch the request and the browser sends it
// itself. Re-sending it from the worker is not equivalent on iOS: Safari drops the
// body of a multipart upload that passes through a service worker, so photo
// uploads arrived at the server empty.

// Evidence photos. Private files are fetched with the session cookie, and the
// whole cache is dropped on logout (see src/lib/pwa.js).
registerRoute(
	({ url, request }) =>
		request.destination === "image" &&
		(url.pathname.startsWith("/files/") || url.pathname.startsWith("/private/files/")),
	new CacheFirst({
		cacheName: FILES_CACHE,
		plugins: [
			new CacheableResponsePlugin({ statuses: [200] }),
			new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 14 * 86400, purgeOnQuotaError: true }),
		],
	})
);

// App shell. Every in-app URL is the same HTML document, so one cache entry
// serves them all: network first, last good copy when offline or slow.
registerRoute(
	({ request, url }) => request.mode === "navigate" && url.pathname.startsWith(scopePath.replace(/\/$/, "")),
	async ({ request }) => {
		const cache = await caches.open(SHELL_CACHE);
		try {
			const response = await withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS);
			// Only keep a real app page. A redirect to a login page or an error is not the shell.
			if (response.ok && !response.redirected && (response.headers.get("content-type") || "").includes("text/html")) {
				await cache.put(shellKey, response.clone());
			}
			return response;
		} catch {
			return (
				(await cache.match(shellKey)) ||
				(precachedIndex && (await matchPrecache(precachedIndex))) ||
				new Response("You are offline and this app has not been opened on this device before.", {
					status: 503,
					headers: { "Content-Type": "text/plain; charset=utf-8" },
				})
			);
		}
	}
);

function withTimeout(promise, ms) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("timeout")), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			}
		);
	});
}

// ----------------------------------------------------------- notifications
// The server sends { title, body, url, tag }. Showing a notification for every
// push is required by browsers (userVisibleOnly), so a malformed one still shows.
self.addEventListener("push", (event) => {
	let data = {};
	try {
		data = event.data?.json() || {};
	} catch {
		data = { title: event.data?.text() };
	}
	const scope = new URL(self.registration.scope);
	const icons = scope.pathname.startsWith("/cw") ? "/assets/cw_pwa/manifest" : "/manifest";

	event.waitUntil(
		self.registration.showNotification(data.title || "C-Water Visits", {
			body: data.body || "",
			tag: data.tag || undefined,
			icon: `${icons}/icon-192.png`,
			badge: `${icons}/favicon-96.png`,
			data: { url: data.url || scope.pathname },
		})
	);
});

// Tapping a notification brings the app forward on the visit it is about.
self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const target = new URL(event.notification.data?.url || "/", self.location.origin).href;

	event.waitUntil(
		(async () => {
			const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
			const open = windows.find((client) => client.url.startsWith(self.registration.scope));
			if (open) {
				await open.focus();
				if ("navigate" in open) await open.navigate(target).catch(() => {});
				return;
			}
			await self.clients.openWindow(target);
		})()
	);
});

// A new version waits until the app asks. Taking over mid-session would leave an
// open page requesting chunks that the new precache no longer has.
self.addEventListener("message", (event) => {
	if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

clientsClaim();
