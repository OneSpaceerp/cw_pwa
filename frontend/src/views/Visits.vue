<script setup>
import { MapPinCheck, Plus, RotateCw, Search } from "@lucide/vue";
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import EmptyState from "@/components/EmptyState.vue";
import PageHeader from "@/components/PageHeader.vue";
import SyncChip from "@/components/SyncChip.vue";
import VisitCard from "@/components/VisitCard.vue";
import { ago, dayLabel, todayISO } from "@/lib/format";
import { settings } from "@/stores/session";
import { syncNow } from "@/stores/sync";
import { listItems, visits } from "@/stores/visits";

const route = useRoute();
const router = useRouter();

const FILTERS = [
	{ id: "open", label: "To do", test: (visit) => ["Planned", "In Progress", "Correction Required"].includes(visit.visit_status) },
	{ id: "today", label: "Today", test: (visit) => visit.planned_date === todayISO() },
	{ id: "done", label: "Sent", test: (visit) => ["Pending Review", "Approved", "Rejected"].includes(visit.visit_status) },
	{ id: "all", label: "All", test: () => true },
];

const filter = ref(FILTERS.some((item) => item.id === route.query.filter) ? route.query.filter : "open");
const query = ref("");

// Keep the filter in the URL so Back returns to the same list.
watch(filter, (value) => router.replace({ query: { ...route.query, filter: value } }));

const filtered = computed(() => {
	const active = FILTERS.find((item) => item.id === filter.value);
	const needle = query.value.trim().toLowerCase();
	return listItems()
		.filter(active.test)
		.filter(
			(visit) =>
				!needle ||
				[visit.customer_name, visit.customer, visit.visit_type, visit.site?.location_name, visit.name]
					.filter(Boolean)
					.some((text) => text.toLowerCase().includes(needle))
		);
});

// To-do lists read soonest first; history reads newest first.
const groups = computed(() => {
	const ascending = filter.value === "open" || filter.value === "today";
	const sorted = [...filtered.value].sort((a, b) => {
		const left = `${a.planned_date} ${a.planned_start_time || ""}`;
		const right = `${b.planned_date} ${b.planned_start_time || ""}`;
		return ascending ? left.localeCompare(right) : right.localeCompare(left);
	});
	const byDay = new Map();
	for (const visit of sorted) {
		if (!byDay.has(visit.planned_date)) byDay.set(visit.planned_date, []);
		byDay.get(visit.planned_date).push(visit);
	}
	return [...byDay.entries()].map(([date, rows]) => ({ date, label: dayLabel(date), rows }));
});

const loadingFirstTime = computed(() => visits.loadingList && !visits.listLoadedAt);
</script>

<template>
	<div class="flex h-full flex-col">
		<PageHeader title="Visits" :subtitle="visits.listLoadedAt ? `Updated ${ago(visits.listLoadedAt)}` : ''">
			<template #actions>
				<SyncChip />
				<button type="button" class="icon-btn" aria-label="Refresh" @click="syncNow">
					<RotateCw :size="20" :class="visits.loadingList ? 'spin' : ''" aria-hidden="true" />
				</button>
			</template>
			<template #below>
				<div class="mx-auto max-w-xl px-4 pb-3">
					<div class="relative">
						<Search :size="18" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden="true" />
						<input v-model="query" type="search" class="field min-h-[44px] bg-sunken py-2 pl-10" placeholder="Search customer or site" aria-label="Search visits" enterkeyhint="search" />
					</div>
					<div class="mt-3 flex gap-1 rounded-control bg-sunken p-1" role="tablist" aria-label="Filter visits">
						<button
							v-for="item in FILTERS"
							:key="item.id"
							type="button"
							role="tab"
							:aria-selected="filter === item.id"
							class="min-h-[40px] flex-1 rounded-[10px] text-sm font-bold transition-colors"
							:class="filter === item.id ? 'bg-surface text-ink shadow-card' : 'text-ink-2'"
							@click="filter = item.id"
						>
							{{ item.label }}
						</button>
					</div>
				</div>
			</template>
		</PageHeader>

		<div class="scroll-area min-h-0 flex-1">
			<div class="mx-auto max-w-xl px-4 pb-28 pt-4">
				<div v-if="loadingFirstTime" class="space-y-3" aria-busy="true" aria-label="Loading visits">
					<div v-for="n in 4" :key="n" class="skeleton h-[124px]"></div>
				</div>

				<template v-else-if="groups.length">
					<section v-for="group in groups" :key="group.date" class="mb-5">
						<h2 class="section-title">{{ group.label }}</h2>
						<div class="space-y-3">
							<VisitCard v-for="visit in group.rows" :key="visit.name" :visit="visit" :show-date="false" />
						</div>
					</section>
				</template>

				<EmptyState
					v-else
					:icon="MapPinCheck"
					:title="query ? 'No visits match your search' : 'No visits here'"
					:text="query ? 'Try a different customer or site name.' : visits.listLoadedAt ? 'Visits assigned to you will appear in this list.' : 'Connect to the internet to load your visits.'"
				/>

				<p v-if="visits.listError" class="mt-4 rounded-control px-4 py-3 text-sm font-semibold tone-bad" role="alert">
					{{ visits.listError }}
				</p>
			</div>
		</div>

		<RouterLink
			v-if="settings().allow_engineer_created_visits"
			:to="{ name: 'visit-new' }"
			class="fixed bottom-[calc(var(--tabbar-height)+theme(spacing.safe-bottom)+16px)] right-4 z-20 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-strong text-on-brand shadow-fab active:scale-95"
			aria-label="New visit"
		>
			<Plus :size="26" aria-hidden="true" />
		</RouterLink>
	</div>
</template>
