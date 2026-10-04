/**
 * Thin client for Frappe's /api/method endpoints.
 *
 * Every request is same-origin and relies on the session cookie. The app never
 * talks to another host directly: a standalone deployment proxies /api instead.
 */

const DEFAULT_TIMEOUT_MS = 30000;
export const BOOT_METHOD = "cw_pwa.api.boot";

let csrfToken = readInlineToken();
let onAuthLost = null;

function readInlineToken() {
	const token = window.cw_boot?.csrf_token;
	// Unrendered Jinja ("{{ csrf_token }}") means ERPNext did not serve this page.
	return token && !token.includes("{{") && token !== "None" ? token : "";
}

export function setCsrfToken(token) {
	csrfToken = token || "";
}

/** Called with no arguments when the server says the session is gone. */
export function onSessionLost(handler) {
	onAuthLost = handler;
}

export class ApiError extends Error {
	constructor(message, { status = 0, excType = "", network = false, timeout = false } = {}) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.excType = excType;
		/** The request never reached the server, or no answer came back. Safe to retry. */
		this.network = network;
		this.timeout = timeout;
	}

	/** Worth retrying later without the user changing anything. */
	get retryable() {
		return this.network || this.status >= 500 || this.status === 429;
	}

	get unauthenticated() {
		return this.status === 401 || this.excType === "AuthenticationError" || this.excType === "SessionExpired";
	}
}

export async function call(method, params = {}, options = {}) {
	try {
		return await request(method, params, options);
	} catch (error) {
		// A token from before the last login is the one failure worth an automatic retry.
		if (error.excType === "CSRFTokenError" && !options.retried) {
			await refreshCsrfToken();
			return request(method, params, { ...options, retried: true });
		}
		if (onAuthLost && method !== BOOT_METHOD && (error.unauthenticated || error.status === 403)) {
			// Frappe answers 403 both for "not allowed" and for "your session ended".
			// Only the second one should send the engineer back to the login screen.
			if (error.unauthenticated || (await isSignedOut())) onAuthLost();
		}
		throw error;
	}
}

export const post = (method, params = {}, options = {}) => call(method, params, { ...options, post: true });

async function refreshCsrfToken() {
	const boot = await request(BOOT_METHOD, {}, {});
	setCsrfToken(boot?.csrf_token);
}

async function isSignedOut() {
	try {
		return (await request(BOOT_METHOD, {}, {}))?.user === "Guest";
	} catch {
		return false;
	}
}

async function request(method, params, { post: isPost = false, formData = null, timeout = DEFAULT_TIMEOUT_MS }) {
	const url = new URL(`/api/method/${method}`, window.location.origin);
	const headers = { Accept: "application/json" };
	const init = { method: isPost ? "POST" : "GET", credentials: "same-origin", headers };

	if (!isPost) {
		for (const [key, value] of Object.entries(params)) {
			if (value === undefined || value === null) continue;
			url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
		}
	} else if (formData) {
		init.body = formData;
	} else {
		headers["Content-Type"] = "application/json";
		init.body = JSON.stringify(dropEmpty(params));
	}
	if (isPost && csrfToken) headers["X-Frappe-CSRF-Token"] = csrfToken;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	init.signal = controller.signal;

	let response;
	try {
		response = await fetch(url, init);
	} catch (cause) {
		const timedOut = cause?.name === "AbortError";
		throw new ApiError(timedOut ? "The server took too long to answer." : "No connection to the server.", {
			network: true,
			timeout: timedOut,
		});
	} finally {
		clearTimeout(timer);
	}

	let body = null;
	try {
		body = await response.json();
	} catch {
		// Proxies and gateways answer with HTML when the backend is down.
	}

	if (!response.ok) {
		throw new ApiError(serverMessage(body) || `Request failed (${response.status}).`, {
			status: response.status,
			excType: body?.exc_type || "",
		});
	}
	return body?.message;
}

function dropEmpty(params) {
	return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null));
}

/** Frappe wraps user-facing errors in `_server_messages`: a JSON list of JSON strings. */
function serverMessage(body) {
	if (!body) return "";
	try {
		const messages = JSON.parse(body._server_messages || "[]")
			.map((raw) => {
				try {
					return JSON.parse(raw).message;
				} catch {
					return raw;
				}
			})
			.filter(Boolean);
		if (messages.length) return htmlToText(messages.join("\n"));
	} catch {
		// fall through to the plainer fields
	}
	if (typeof body.message === "string") return htmlToText(body.message);
	if (body.exception) return htmlToText(String(body.exception).split(":").slice(1).join(":").trim() || body.exception);
	return "";
}

function htmlToText(html) {
	return String(html)
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/(p|div|li)>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\n{2,}/g, "\n")
		.trim();
}
