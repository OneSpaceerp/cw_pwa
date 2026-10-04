<script setup>
import { CalendarCheck2, ChevronRight, MapPin, Play, Plus, RotateCw } from "@lucide/vue";
import { computed, onMounted } from "vue";

import EmptyState from "@/components/EmptyState.vue";
import Pill from "@/components/Pill.vue";
import SyncChip from "@/components/SyncChip.vue";
import VisitCard from "@/components/VisitCard.vue";
import { ago, dayLabel, STATUS, timeLabel, todayISO } from "@/lib/format";
import { pwa } from "@/lib/pwa";
import { loadAlerts } from "@/stores/alerts";
import { session, settings } from "@/stores/session";
import { syncNow } from "@/stores/sync";
import { listItems, visits } from "@/stores/visits";

const OPEN = ["Planned", "In Progress", "Correction Required"];

const items = computed(() => listItems());
const today = todayISO();

const firstName = computed(() => (session.boot?.full_name || "").split(" ")[0]);
const greeting = computed(() => {
	const hour = new Date().getHours();
	return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
});

// What the engineer should do next: a visit already under way, then one sent back, then today's next.
const nextUp = computed(() => {
	const all = items.value;
	return (
		all.find((visit) => visit.visit_status === "In Progress") ||
		all.find((visit) => visit.visit_status === "Correction Required") ||
		all
			.filter((visit) => visit.visit_status === "Planned" && visit.planned_date <= today)
			.sort(byPlanned)[0] ||
		null
	);
});

const todays = computed(() =>
	items.value
		.filter((visit) => visit.planned_date === today && visit.name !== nextUp.value?.name)
		.sort(byPlanned)
);
const upcoming = computed(() =>
	items.value
		.filter((visit) => visit.planned_date > today && visit.visit_status === "Planned")
		.sort(byPlanned)
		.slice(0, 3)
);

const counts = computed(() => ({
	today: items.value.filter((visit) => visit.planned_date === today).length,
	open: items.value.filter((visit) => OPEN.includes(visit.visit_status)).length,
	review: items.value.filter((visit) => visit.visit_status === "Pending Review").length,
}));

function byPlanned(a, b) {
	return `${a.planned_date} ${a.planned_start_time || "99"}`.localeCompare(`${b.planned_date} ${b.planned_start_time || "99"}`);
}

const nextAction = computed(() => {
	const status = nextUp.value?.visit_status;
	if (status === "In Progress") return "Continue visit";
	if (status === "Correction Required") return "Fix and resubmit";
	return "Open visit";
});

onMounted(() => {
	syncNow();
	loadAlerts();
});
</script>

<template>
	<div class="scroll-area h-full">
		<header
			class="bg-hero px-5 pb-16 text-on-hero"
			:class="session.online && !pwa.updateReady ? 'pt-[calc(theme(spacing.safe-top)+20px)]' : 'pt-5'"
		>
			<div class="mx-auto flex max-w-xl items-start justify-between gap-3">
				<div class="min-w-0">
					<p class="text-sm font-semibold opacity-90">{{ greeting }}</p>
					<h1 class="truncate text-2xl font-extrabold">{{ firstName || "Engineer" }}</h1>
				</div>
				<div class="flex items-center gap-2">
					<SyncChip />
					<button
						type="button"
						class="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 active:bg-white/25"
						aria-label="Refresh"
						@click="syncNow"
					>
						<RotateCw :size="20" :class="visits.loadingList ? 'spin' : ''" aria-hidden="true" />
					</button>
				</div>
			</div>
		</header>

		<div class="mx-auto -mt-12 max-w-xl space-y-6 px-4 pb-28">
			<!-- Next up -->
			<section v-if="nextUp" aria-label="Next visit">
				<RouterLink
					:to="{ name: 'visit', params: { name: nextUp.name } }"
					class="card block p-5 transition-transform active:scale-[0.99]"
				>
					<div class="flex items-center justify-between gap-2">
						<span class="text-xs font-bold uppercase tracking-wider text-ink-3">Next up</span>
						<Pill :tone="(STATUS[nextUp.visit_status] || {}).tone" dot>
							{{ (STATUS[nextUp.visit_status] || {}).label || nextUp.visit_status }}
						</Pill>
					</div>
					<h2 class="mt-2 text-xl font-extrabold text-ink">{{ nextUp.customer_name || nextUp.customer }}</h2>
					<p class="font-medium text-ink-2">{{ nextUp.visit_type }}</p>
					<p v-if="nextUp.site?.location_name" class="mt-2 flex items-center gap-1.5 text-sm text-ink-2">
						<MapPin :size="16" class="shrink-0 text-ink-3" aria-hidden="true" />
						<span class="truncate">{{ nextUp.site.location_name }}</span>
					</p>
					<div class="mt-4 flex items-center justify-between gap-3">
						<span class="text-sm font-semibold text-ink-2">
							{{ dayLabel(nextUp.planned_date) }}<template v-if="nextUp.planned_start_time"> · {{ timeLabel(nextUp.planned_start_time) }}</template>
						</span>
						<span class="btn-primary min-h-[44px] px-4 text-sm">
							<Play :size="16" aria-hidden="true" />
							{{ nextAction }}
						</span>
					</div>
				</RouterLink>
			</section>

			<section v-else class="card" aria-label="Next visit">
				<EmptyState
					:icon="CalendarCheck2"
					title="Nothing waiting for you"
					:text="visits.listLoadedAt ? 'New visits appear here as soon as they are assigned.' : 'Connect to the internet to load your visits.'"
				/>
			</section>

			<!-- Counts -->
			<section class="grid grid-cols-3 gap-3" aria-label="Summary">
				<RouterLink :to="{ name: 'visits', query: { filter: 'today' } }" class="card p-3.5 text-center active:scale-[0.98]">
					<p class="numeric text-2xl font-extrabold text-ink">{{ counts.today }}</p>
					<p class="text-xs font-semibold text-ink-2">Today</p>
				</RouterLink>
				<RouterLink :to="{ name: 'visits', query: { filter: 'open' } }" class="card p-3.5 text-center active:scale-[0.98]">
					<p class="numeric text-2xl font-extrabold text-ink">{{ counts.open }}</p>
					<p class="text-xs font-semibold text-ink-2">To do</p>
				</RouterLink>
				<RouterLink :to="{ name: 'visits', query: { filter: 'done' } }" class="card p-3.5 text-center active:scale-[0.98]">
					<p class="numeric text-2xl font-extrabold text-ink">{{ counts.review }}</p>
					<p class="text-xs font-semibold text-ink-2">In review</p>
				</RouterLink>
			</section>

			<section v-if="todays.length" aria-labelledby="home-today">
				<h2 id="home-today" class="section-title">Also today</h2>
				<div class="space-y-3">
					<VisitCard v-for="visit in todays" :key="visit.name" :visit="visit" :show-date="false" />
				</div>
			</section>

			<section v-if="upcoming.length" aria-labelledby="home-upcoming">
				<div class="mb-2 flex items-center justify-between px-1">
					<h2 id="home-upcoming" class="section-title mb-0 px-0">Coming up</h2>
					<RouterLink :to="{ name: 'visits', query: { filter: 'open' } }" class="inline-flex min-h-[44px] items-center text-sm font-bold text-brand-strong">
						All visits
						<ChevronRight :size="16" aria-hidden="true" />
					</RouterLink>
				</div>
				<div class="space-y-3">
					<VisitCard v-for="visit in upcoming" :key="visit.name" :visit="visit" />
				</div>
			</section>

			<p v-if="visits.listLoadedAt" class="text-center text-xs text-ink-3">
				Visits updated {{ ago(visits.listLoadedAt) }}
			</p>
			<p v-if="visits.listError" class="rounded-control px-4 py-3 text-sm font-semibold tone-bad" role="alert">
				{{ visits.listError }}
			</p>
		</div>

		<RouterLink
			v-if="settings().allow_engineer_created_visits"
			:to="{ name: 'visit-new' }"
			class="fixed bottom-[calc(var(--tabbar-height)+theme(spacing.safe-bottom)+16px)] right-4 z-20 inline-flex h-14 items-center gap-2 rounded-full bg-brand-strong px-5 font-bold text-on-brand shadow-fab active:scale-95"
		>
			<Plus :size="22" aria-hidden="true" />
			New visit
		</RouterLink>
	</div>
</template>
