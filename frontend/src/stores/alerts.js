/** In-app notifications (visit assigned, needs correction, approved, ...). */
import { reactive } from "vue";

import { call, post } from "@/lib/api";
import * as db from "@/lib/db";

const KEY = "alerts";

export const alerts = reactive({
	items: [],
	unread: 0,
	loading: false,
	loadedAt: null,
	error: "",
});

export async function loadAlerts() {
	if (!alerts.loadedAt) {
		const cached = await db.get("kv", KEY);
		if (cached) Object.assign(alerts, cached);
	}
	if (alerts.loading) return;

	alerts.loading = true;
	try {
		const result = await call("cw_visit.api.v1.notifications", { limit: 40 });
		alerts.items = result.items;
		alerts.unread = result.unread;
		alerts.loadedAt = Date.now();
		alerts.error = "";
		await db.put("kv", db.plain({ items: alerts.items, unread: alerts.unread, loadedAt: alerts.loadedAt }), KEY);
		syncBadge();
	} catch (error) {
		alerts.error = error.network ? "" : error.message;
	} finally {
		alerts.loading = false;
	}
}

export async function markAllRead() {
	if (!alerts.unread) return;
	alerts.items.forEach((item) => (item.read = 1));
	alerts.unread = 0;
	syncBadge();
	try {
		await post("cw_visit.api.v1.mark_notifications_read");
	} catch {
		// Not worth queuing: the next load shows the server's own state.
	}
}

/** Mirror the unread count on the home-screen icon where the platform supports it. */
function syncBadge() {
	try {
		if (alerts.unread > 0) navigator.setAppBadge?.(alerts.unread);
		else navigator.clearAppBadge?.();
	} catch {
		// unsupported - nothing to do
	}
}
