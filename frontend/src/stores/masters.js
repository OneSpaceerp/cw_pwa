/** The catalogue (parameters, categories, service types, option lists), cached for offline use. */
import { reactive } from "vue";

import { call } from "@/lib/api";
import * as db from "@/lib/db";

const KEY = "masters";
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export const masters = reactive({
	data: null,
	loadedAt: null,
	error: "",
});

const EMPTY = {
	parameters: [],
	finding_categories: [],
	operation_types: [],
	service_types: [],
	checklist_templates: [],
	options: {},
	currency: "",
};

export const catalogue = () => masters.data || EMPTY;
export const options = (name) => catalogue().options?.[name] || [];
export const parameter = (name) => catalogue().parameters.find((row) => row.name === name);
export const serviceType = (name) => catalogue().service_types.find((row) => row.name === name);

export async function loadMasters({ force = false } = {}) {
	if (!masters.data) {
		const cached = await db.get("kv", KEY);
		if (cached) {
			masters.data = cached.data;
			masters.loadedAt = cached.loadedAt;
		}
	}

	const stale = !masters.loadedAt || Date.now() - masters.loadedAt > MAX_AGE_MS;
	if (!force && !stale) return;

	try {
		masters.data = await call("cw_visit.api.v1.masters");
		masters.loadedAt = Date.now();
		masters.error = "";
		await db.put("kv", db.plain({ data: masters.data, loadedAt: masters.loadedAt }), KEY);
	} catch (error) {
		// Offline with a cached catalogue is fine. Without one, say so.
		masters.error = masters.data ? "" : error.message;
	}
}
