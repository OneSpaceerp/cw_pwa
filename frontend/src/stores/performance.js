/**
 * The engineer's KPI scorecard (cw_kpi_management.mobile.my_performance).
 *
 * The last answer is kept on the phone so the screen opens offline and on a weak
 * connection, with its age shown.
 */
import { reactive } from "vue";

import { call } from "@/lib/api";
import * as db from "@/lib/db";
import { session } from "@/stores/session";

const KEY = "performance";

export const performance = reactive({
	data: null,
	loadedAt: null,
	loading: false,
	error: "",
});

export const kpiEnabled = () => Boolean(session.boot?.features?.kpi);

export async function loadCachedPerformance() {
	const cached = await db.get("kv", KEY);
	if (cached && cached.user === session.boot?.user) {
		performance.data = cached.data;
		performance.loadedAt = cached.loadedAt;
	}
}

export async function refreshPerformance() {
	if (!kpiEnabled() || performance.loading) return;
	performance.loading = true;
	performance.error = "";
	try {
		const data = await call("cw_kpi_management.mobile.my_performance");
		performance.data = data;
		performance.loadedAt = Date.now();
		await db.put("kv", db.plain({ user: session.boot?.user, data, loadedAt: performance.loadedAt }), KEY);
	} catch (error) {
		performance.error = error.network ? "" : error.message || "The scorecard could not be loaded.";
	} finally {
		performance.loading = false;
	}
}
