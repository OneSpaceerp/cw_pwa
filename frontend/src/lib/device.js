/** Device capabilities: location, photos, haptics. Every call is feature-detected. */

const GPS_TIMEOUT_MS = 15000;

/**
 * Resolves with { latitude, longitude, accuracy } or rejects with an Error whose
 * message is safe to show. Never invents a position or an accuracy.
 */
export function getPosition({ timeout = GPS_TIMEOUT_MS } = {}) {
	return new Promise((resolve, reject) => {
		if (!("geolocation" in navigator)) {
			reject(new Error("This device does not provide a location."));
			return;
		}
		navigator.geolocation.getCurrentPosition(
			({ coords }) =>
				resolve({
					latitude: coords.latitude,
					longitude: coords.longitude,
					accuracy: Number.isFinite(coords.accuracy) ? Math.round(coords.accuracy * 10) / 10 : null,
				}),
			(error) => {
				const reasons = {
					1: "Location permission was denied. Allow location for this app in your phone settings.",
					2: "The location is unavailable right now. Move to open sky and try again.",
					3: "Getting the location took too long. Try again.",
				};
				reject(new Error(reasons[error.code] || "The location could not be read."));
			},
			{ enableHighAccuracy: true, timeout, maximumAge: 0 }
		);
	});
}

export function vibrate(pattern = 12) {
	try {
		navigator.vibrate?.(pattern);
	} catch {
		// not supported (iOS) - nothing to do
	}
}

const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Downscale a camera photo before it is queued. A 12 MP original is several MB;
 * 1600 px on the long edge is plenty for an inspection record and far kinder to a
 * weak connection. Falls back to the original file if the browser cannot decode it.
 */
export async function compressImage(file) {
	if (!file.type.startsWith("image/") || !("createImageBitmap" in window)) return file;
	try {
		const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
		const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement("canvas");
		canvas.width = Math.round(bitmap.width * scale);
		canvas.height = Math.round(bitmap.height * scale);
		canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		bitmap.close?.();

		const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
		return blob && blob.size < file.size ? blob : file;
	} catch {
		return file;
	}
}

export function mapsUrl(latitude, longitude) {
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

export function directionsUrl(latitude, longitude) {
	return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

export function uuid() {
	if (crypto.randomUUID) return crypto.randomUUID();
	// Older WebViews on plain http: still random, just assembled by hand.
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
