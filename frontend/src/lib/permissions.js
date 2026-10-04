/**
 * The three phone permissions the app uses: location, camera, notifications.
 *
 * Browsers only show a permission prompt in response to a tap, and a prompt that
 * was refused cannot be shown again from code: the engineer has to change it in the
 * phone's settings. So the app asks once, explains why, and reports the real state.
 */
import { reactive } from "vue";

import { post } from "./api";
import { isStandalone, pwa } from "./pwa";

const ASKED_KEY = "cw:permissions-asked";

/** Each is "granted", "denied", "prompt" (not asked yet) or "unsupported". */
export const permissions = reactive({
	location: "prompt",
	camera: "prompt",
	notifications: "prompt",
	/** True when notifications cannot work in this browser as it is being used. */
	notificationsNeedInstall: false,
});

let pushPublicKey = null;

export function configurePush(publicKey) {
	pushPublicKey = publicKey || null;
}

async function query(name) {
	try {
		return (await navigator.permissions.query({ name })).state;
	} catch {
		return null; // Safari does not answer for every permission
	}
}

/** Read the current state without prompting. */
export async function refreshPermissions() {
	permissions.location = "geolocation" in navigator ? (await query("geolocation")) || permissions.location : "unsupported";

	permissions.camera = navigator.mediaDevices?.getUserMedia
		? (await query("camera")) || permissions.camera
		: "unsupported";

	const pushSupported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
	// On iPhone, web notifications exist only for an app added to the Home Screen.
	permissions.notificationsNeedInstall = pwa.isIos && !isStandalone();
	if (!pushSupported) {
		permissions.notifications = "unsupported";
	} else {
		permissions.notifications = Notification.permission === "default" ? "prompt" : Notification.permission;
	}
}

export function requestLocation() {
	return new Promise((resolve) => {
		if (!("geolocation" in navigator)) {
			permissions.location = "unsupported";
			resolve(permissions.location);
			return;
		}
		navigator.geolocation.getCurrentPosition(
			() => {
				permissions.location = "granted";
				resolve("granted");
			},
			(error) => {
				// Code 1 is a refusal. A timeout or no signal still means access was allowed.
				permissions.location = error.code === 1 ? "denied" : "granted";
				resolve(permissions.location);
			},
			{ enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
		);
	});
}

export async function requestCamera() {
	if (!navigator.mediaDevices?.getUserMedia) {
		permissions.camera = "unsupported";
		return permissions.camera;
	}
	try {
		const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
		// Only the permission was wanted; release the camera at once.
		stream.getTracks().forEach((track) => track.stop());
		permissions.camera = "granted";
	} catch (error) {
		permissions.camera = error?.name === "NotAllowedError" || error?.name === "SecurityError" ? "denied" : "unsupported";
	}
	return permissions.camera;
}

export async function requestNotifications() {
	await refreshPermissions();
	if (permissions.notifications === "unsupported" || permissions.notificationsNeedInstall) {
		return permissions.notifications;
	}
	const answer = await Notification.requestPermission();
	permissions.notifications = answer === "default" ? "prompt" : answer;
	if (answer === "granted") await subscribeToPush();
	return permissions.notifications;
}

function keyToBytes(base64url) {
	const padded = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
	return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

/**
 * Register this browser with the server so alerts reach it while the app is closed.
 * Safe to call on every start: an existing subscription is reused and re-sent, which
 * also re-links the phone when a different engineer signs in.
 */
export async function subscribeToPush() {
	if (!pushPublicKey || !("PushManager" in window) || Notification.permission !== "granted") return false;
	try {
		const registration = await navigator.serviceWorker.ready;
		let subscription = await registration.pushManager.getSubscription();
		if (!subscription) {
			subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: keyToBytes(pushPublicKey),
			});
		}
		await post("cw_pwa.api.subscribe_push", { subscription: subscription.toJSON() });
		return true;
	} catch (error) {
		console.warn("Push subscription failed", error);
		return false;
	}
}

/** Called on sign-out so the next person on this phone does not get these alerts. */
export async function unsubscribeFromPush() {
	try {
		const registration = await navigator.serviceWorker?.getRegistration();
		const subscription = await registration?.pushManager?.getSubscription();
		if (!subscription) return;
		await post("cw_pwa.api.unsubscribe_push", { endpoint: subscription.endpoint }).catch(() => {});
		await subscription.unsubscribe();
	} catch {
		// nothing to undo
	}
}

export const sendTestNotification = () => post("cw_pwa.api.test_push");

export function wasAsked() {
	try {
		return localStorage.getItem(ASKED_KEY) === "1";
	} catch {
		return true;
	}
}

export function markAsked() {
	try {
		localStorage.setItem(ASKED_KEY, "1");
	} catch {
		// the sheet may simply show again
	}
}
