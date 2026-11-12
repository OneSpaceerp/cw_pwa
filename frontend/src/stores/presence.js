/**
 * Site presence during a visit: is the engineer still at the place they checked in?
 *
 * While a visit is checked in and not checked out, the app follows the phone's position
 * and measures the distance to the check-in point (or to the site, without one):
 *
 *   within the warning distance (500 m)   on site: "last seen on site" moves forward
 *   beyond it                              a notification asks whether they forgot to
 *                                          check out (once per visit)
 *   beyond the check-out distance (1000 m) the visit is checked out automatically, at
 *                                          the last time they were seen on site
 *
 * The last-seen time is what makes visit durations accurate: an engineer who drives
 * off without checking out is checked out at the time they left, not when the app
 * noticed. The visit stays open for the report; only the time on site is closed.
 *
 * A web app receives positions only while it is open on screen. When the engineer
 * comes back to it, one fresh reading settles what happened while it was closed.
 * The server's open-visit reminder covers an app that is never reopened.
 */
import { reactive } from "vue";

import * as db from "@/lib/db";
import { vibrate } from "@/lib/device";
import { t } from "@/lib/i18n";
import { hasCoordinates, haversine } from "@/lib/rules";
import { settings } from "@/stores/session";
import { toast } from "@/stores/ui";
import { checkOutVisit, localTimestamp, visits } from "@/stores/visits";

const KEY = (name) => `presence:${name}`;
// Readings less precise than this are ignored: a GPS fix inside a building can be off
// by hundreds of metres and must not check anyone out.
const MAX_ACCURACY_M = 150;
// Two readings beyond the check-out distance, this far apart, before checking out.
const CONFIRM_AFTER_MS = 20000;

export const presence = reactive({
	/** visit name -> { distance, accuracy, state, at } for the screens */
	live: {},
	watching: false,
	error: "",
});

const memo = {}; // visit name -> persisted { lastOnSite, warned, leftAt }
let watchId = null;
let started = false;

function thresholds() {
	const s = settings();
	return {
		enabled: s.enable_site_presence === undefined ? true : Boolean(s.enable_site_presence),
		warn: Number(s.away_warning_meters) || 500,
		auto: s.auto_checkout_meters === undefined ? 1000 : Number(s.auto_checkout_meters) || 0,
	};
}

/** Visits on site right now: checked in, not checked out, still the engineer's to work on. */
export function activeVisits() {
	return Object.values(visits.records)
		.map((record) => record.data)
		.filter(
			(data) =>
				data &&
				data.checkin_time &&
				!data.checkout_time &&
				["In Progress", "Correction Required"].includes(data.visit_status) &&
				anchorOf(data)
		);
}

/** Where "on site" is measured from: the check-in point, else the site's coordinates. */
export function anchorOf(data) {
	if (hasCoordinates(data.checkin_latitude, data.checkin_longitude)) {
		return { latitude: Number(data.checkin_latitude), longitude: Number(data.checkin_longitude), kind: "checkin" };
	}
	const site = data.site;
	if (site && hasCoordinates(site.latitude, site.longitude)) {
		return { latitude: Number(site.latitude), longitude: Number(site.longitude), kind: "site" };
	}
	return null;
}

export function classify(distance, { warn, auto }) {
	if (auto && distance > auto) return "left";
	if (warn && distance > warn) return "away";
	return "on-site";
}

async function state(name) {
	if (!memo[name]) memo[name] = (await db.get("kv", KEY(name))) || {};
	return memo[name];
}

async function save(name) {
	await db.put("kv", db.plain(memo[name]), KEY(name));
}

/** One position reading, applied to every visit on site. */
export async function evaluate(position, { resumed = false } = {}) {
	const limits = thresholds();
	if (!limits.enabled || !position) return;
	if (position.accuracy != null && position.accuracy > MAX_ACCURACY_M) return;

	for (const data of activeVisits()) {
		const anchor = anchorOf(data);
		const distance = haversine(position.latitude, position.longitude, anchor.latitude, anchor.longitude);
		const where = classify(distance, limits);
		const mine = await state(data.name);
		const now = localTimestamp();
		presence.live[data.name] = {
			distance,
			latitude: position.latitude,
			longitude: position.longitude,
			accuracy: position.accuracy,
			state: where,
			at: now,
			anchor: anchor.kind,
		};

		if (where === "on-site") {
			mine.lastOnSite = now;
			mine.leftAt = null;
			mine.warned = false; // back on site: warn again if they leave again
			await save(data.name);
			continue;
		}

		if (where === "away" && !mine.warned) {
			mine.warned = true;
			await save(data.name);
			remind(data, distance);
		}

		if (where === "left") {
			// A reading on reopening the app is enough; while it is open, wait for a second
			// reading so a single GPS jump cannot end a visit.
			const confirmed = resumed || (mine.leftAt && Date.now() - mine.leftAt >= CONFIRM_AFTER_MS);
			if (!confirmed) {
				mine.leftAt = mine.leftAt || Date.now();
				await save(data.name);
				continue;
			}
			const lastSeen = mine.lastOnSite || data.checkin_time;
			const done = await checkOutVisit(data.name, {
				position,
				source: "Auto - Left Site",
				leftSiteAt: lastSeen,
				distance,
			});
			if (done) {
				vibrate([20, 80, 20]);
				notify(
					t("Checked out of {customer}", { customer: data.customer_name || data.customer }),
					t("You left the site. The visit ended at {time}; you can still finish the report.", {
						time: String(lastSeen).slice(11, 16),
					}),
					data.name
				);
			}
		}
	}
}

function remind(data, distance) {
	vibrate([15, 60, 15]);
	notify(
		t("Did you forget to check out?"),
		t("You are {distance} m from {customer}. Check out if you have finished on site.", {
			distance: Math.round(distance),
			customer: data.customer_name || data.customer,
		}),
		data.name
	);
}

/** A system notification when allowed (it shows even if the app is in the background), else a toast. */
async function notify(title, body, visit) {
	try {
		if ("Notification" in window && Notification.permission === "granted" && navigator.serviceWorker) {
			const registration = await navigator.serviceWorker.ready;
			const base = (registration.scope && new URL(registration.scope).pathname) || "/";
			await registration.showNotification(title, {
				body,
				tag: `presence:${visit}`,
				icon: `${__ICONS__}/icon-192.png`,
				badge: `${__ICONS__}/favicon-96.png`,
				data: { url: `${base.replace(/\/$/, "")}/visits/${visit}` },
			});
			if (document.visibilityState === "visible") toast(body, "warn", 6000);
			return;
		}
	} catch {
		// fall through to the toast
	}
	toast(`${title} ${body}`, "warn", 8000);
}

// --------------------------------------------------------------- the watcher

function onPosition({ coords }) {
	presence.error = "";
	evaluate({
		latitude: coords.latitude,
		longitude: coords.longitude,
		accuracy: Number.isFinite(coords.accuracy) ? Math.round(coords.accuracy) : null,
	});
}

function onError(error) {
	presence.error =
		error?.code === 1
			? t("Location is off for this app, so it cannot tell when you leave the site.")
			: t("Waiting for a location fix.");
}

/** Start or stop following the phone's position as visits are checked in and out. */
export function syncWatcher() {
	const needed =
		thresholds().enabled && activeVisits().length > 0 && document.visibilityState === "visible" && "geolocation" in navigator;
	if (needed && watchId === null) {
		watchId = navigator.geolocation.watchPosition(onPosition, onError, {
			enableHighAccuracy: true,
			maximumAge: 15000,
			timeout: 60000,
		});
		presence.watching = true;
	} else if (!needed && watchId !== null) {
		navigator.geolocation.clearWatch(watchId);
		watchId = null;
		presence.watching = false;
	}
}

/** Coming back to the app: one fresh reading settles what happened while it was closed. */
function catchUp() {
	if (!thresholds().enabled || !activeVisits().length || !("geolocation" in navigator)) return;
	navigator.geolocation.getCurrentPosition(
		({ coords }) =>
			evaluate(
				{
					latitude: coords.latitude,
					longitude: coords.longitude,
					accuracy: Number.isFinite(coords.accuracy) ? Math.round(coords.accuracy) : null,
				},
				{ resumed: true }
			),
		() => {},
		{ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
	);
}

export function startPresence() {
	if (started) return;
	started = true;
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") catchUp();
		syncWatcher();
	});
	// Visits load and change over time; check every few seconds whether watching is needed.
	setInterval(syncWatcher, 5000);
	setTimeout(() => {
		catchUp();
		syncWatcher();
	}, 1500);
}
