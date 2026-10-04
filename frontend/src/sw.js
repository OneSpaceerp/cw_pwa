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
import { registerRoute, setDefaultHandler } from "workbox-routing";
import { CacheFirst, NetworkOnly } from "workbox-strategies";

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

// The API (including login and logout) always goes to the network, untouched.
registerRoute(({ url }) => url.pathname.startsWith("/api/"), new NetworkOnly());
registerRoute(({ url }) => url.pathname.startsWith("/api/"), new NetworkOnly(), "POST");

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

setDefaultHandler(new NetworkOnly());

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

// A new version waits until the app asks. Taking over mid-session would leave an
// open page requesting chunks that the new precache no longer has.
self.addEventListener("message", (event) => {
	if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

clientsClaim();
