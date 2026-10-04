/** Transient UI state: toasts and a promise-based confirm dialog. */
import { reactive } from "vue";

export const ui = reactive({
	toasts: [],
	confirm: null,
});

let nextId = 1;

// ------------------------------------------------------------------ overlays
// On Android the system Back button should close an open sheet before it leaves
// the screen. Open overlays register a close function here, and the router asks
// `closeTopOverlayOnBack` before it lets a Back navigation through.
const overlays = [];
let backPressed = false;
window.addEventListener("popstate", () => (backPressed = true));

export function registerOverlay(close) {
	overlays.push(close);
	return () => {
		const index = overlays.indexOf(close);
		if (index >= 0) overlays.splice(index, 1);
	};
}

/** True when a Back press was used up closing an overlay, so the navigation must be cancelled. */
export function closeTopOverlayOnBack() {
	const wasBack = backPressed;
	backPressed = false;
	if (!wasBack || !overlays.length) return false;
	overlays[overlays.length - 1]();
	return true;
}

export function toast(message, tone = "info", duration = 3500) {
	const id = nextId++;
	ui.toasts.push({ id, message, tone });
	setTimeout(() => {
		const index = ui.toasts.findIndex((item) => item.id === id);
		if (index >= 0) ui.toasts.splice(index, 1);
	}, duration);
}

export const toastError = (error, fallback = "Something went wrong.") =>
	toast(error?.message || fallback, "bad", 5000);

/** Resolves true or false. `danger` styles the confirm button as destructive. */
export function confirm({ title, message = "", confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false }) {
	return new Promise((resolve) => {
		const answerWith = (answer) => {
			unregister();
			ui.confirm = null;
			resolve(answer);
		};
		const unregister = registerOverlay(() => answerWith(false));
		ui.confirm = { title, message, confirmLabel, cancelLabel, danger, resolve: answerWith };
	});
}
