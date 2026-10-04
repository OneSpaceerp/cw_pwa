<script setup>
/**
 * Choose a customer from a list that can be scrolled and filtered.
 * The list loads a page at a time; typing narrows it on the server.
 */
import { Building2, Check, LoaderCircle, Search } from "@lucide/vue";
import { reactive, ref, watch } from "vue";

import { call } from "@/lib/api";
import * as db from "@/lib/db";
import { t } from "@/lib/i18n";

import BottomSheet from "./BottomSheet.vue";

const props = defineProps({
	open: { type: Boolean, default: false },
	selected: { type: Object, default: null },
});
const emit = defineEmits(["close", "select"]);

const CACHE_KEY = "customers:first-page";

const query = ref("");
const state = reactive({ items: [], hasMore: false, busy: false, error: "", fromCache: false });
let timer = null;
let latest = 0;

async function load({ append = false } = {}) {
	const request = ++latest;
	state.busy = true;
	state.error = "";
	try {
		const result = await call("cw_visit.api.v1.search_customers", {
			query: query.value.trim(),
			start: append ? state.items.length : 0,
		});
		if (request !== latest) return; // a newer search has replaced this one
		state.items = append ? [...state.items, ...result.customers] : result.customers;
		state.hasMore = result.has_more;
		state.fromCache = false;
		if (!append && !query.value.trim()) await db.put("kv", db.plain(result.customers), CACHE_KEY);
	} catch (error) {
		if (request !== latest) return;
		// Offline: show the customers this phone last saw, filtered locally.
		const cached = (await db.get("kv", CACHE_KEY)) || [];
		const needle = query.value.trim().toLowerCase();
		state.items = cached.filter(
			(row) => !needle || row.customer_name.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle)
		);
		state.hasMore = false;
		state.fromCache = true;
		state.error = error.network ? "" : error.message;
	} finally {
		if (request === latest) state.busy = false;
	}
}

watch(
	() => props.open,
	(open) => {
		if (!open) return;
		query.value = "";
		load();
	}
);

watch(query, () => {
	clearTimeout(timer);
	timer = setTimeout(load, 250);
});
</script>

<template>
	<BottomSheet :open="open" :title="t('Choose customer')" @close="emit('close')">
		<div class="sticky top-0 z-10 -mx-1 bg-surface px-1 pb-3 pt-1">
			<div class="relative">
				<Search :size="18" class="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden="true" />
				<input
					v-model="query"
					type="search"
					class="field ps-11"
					placeholder="Filter by name or code"
					aria-label="Filter customers"
					autocomplete="off"
					enterkeyhint="search"
				/>
				<LoaderCircle v-if="state.busy" :size="18" class="spin absolute end-4 top-1/2 -mt-[9px] text-ink-3" aria-hidden="true" />
			</div>
			<p v-if="state.fromCache" class="mt-2 text-sm font-semibold text-warn">
				You are offline. Showing the customers saved on this phone.
			</p>
		</div>

		<ul v-if="state.items.length" class="card-outline divide-y divide-line overflow-hidden" role="listbox" :aria-label="t('Customers')">
			<li v-for="customer in state.items" :key="customer.name">
				<button
					type="button"
					role="option"
					:aria-selected="selected?.name === customer.name"
					class="link-row"
					:class="selected?.name === customer.name ? 'bg-brand-soft' : ''"
					@click="emit('select', customer)"
				>
					<span class="icon-tile h-10 w-10" aria-hidden="true"><Building2 :size="19" /></span>
					<span class="min-w-0 flex-1">
						<span class="block truncate font-semibold text-ink">{{ customer.customer_name }}</span>
						<span v-if="customer.name !== customer.customer_name" class="ltr block truncate text-sm text-ink-3">{{ customer.name }}</span>
					</span>
					<Check v-if="selected?.name === customer.name" :size="20" class="shrink-0 text-brand-strong" aria-hidden="true" />
				</button>
			</li>
		</ul>

		<p v-else-if="!state.busy" class="py-10 text-center text-ink-2">
			{{ query.trim() ? t("No customer matches. New customers are added in ERPNext by the office.") : t("No customers to show.") }}
		</p>

		<div v-else-if="!state.items.length" class="space-y-2" aria-busy="true">
			<div v-for="n in 6" :key="n" class="skeleton h-16"></div>
		</div>

		<button v-if="state.hasMore" type="button" class="btn-quiet btn-block mt-3" :disabled="state.busy" @click="load({ append: true })">
			Show more
		</button>
		<p v-if="state.error" class="field-error" role="alert">{{ state.error }}</p>
	</BottomSheet>
</template>
