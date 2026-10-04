<script setup>
import { Bell, CalendarCheck2, ChevronRight, ClipboardCheck, CloudUpload, MapPin, Play, RotateCw } from "@lucide/vue";
import { computed, onMounted, ref } from "vue";

import BottomSheet from "@/components/BottomSheet.vue";
import EmptyState from "@/components/EmptyState.vue";
import PermissionsList from "@/components/PermissionsList.vue";
import Pill from "@/components/Pill.vue";
import SyncChip from "@/components/SyncChip.vue";
import VisitCard from "@/components/VisitCard.vue";
import { ago, dayLabel, initials, STATUS, timeLabel, todayISO } from "@/lib/format";
import { t } from "@/lib/i18n";
import { markAsked, wasAsked } from "@/lib/permissions";
import { pwa } from "@/lib/pwa";
import { alerts, loadAlerts } from "@/stores/alerts";
import { failedCount, waitingCount } from "@/stores/outbox";
import { session } from "@/stores/session";
import { syncNow } from "@/stores/sync";
import { listItems, visits } from "@/stores/visits";

const OPEN = ["Planned", "In Progress", "Correction Required"];
const logo = `${__ICONS__}/icon-192.png`;

const items = computed(() => listItems());
const today = todayISO();

const greeting = computed(() => {
	const hour = new Date().getHours();
	return hour < 12 ? t("Good morning,") : hour < 17 ? t("Good afternoon,") : t("Good evening,");
});

// What the engineer should do next: a visit already under way, then one sent back, then today's next.
const nextUp = computed(() => {
	const all = items.value;
	return (
		all.find((visit) => visit.visit_status === "In Progress") ||
		all.find((visit) => visit.visit_status === "Correction Required") ||
		all.filter((visit) => visit.visit_status === "Planned" && visit.planned_date <= today).sort(byPlanned)[0] ||
		null
	);
});

const todays = computed(() =>
	items.value.filter((visit) => visit.planned_date === today && visit.name !== nextUp.value?.name).sort(byPlanned)
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
const unsynced = computed(() => waitingCount() + failedCount());

function byPlanned(a, b) {
	return `${a.planned_date} ${a.planned_start_time || "99"}`.localeCompare(`${b.planned_date} ${b.planned_start_time || "99"}`);
}

const nextAction = computed(() => {
	const status = nextUp.value?.visit_status;
	if (status === "In Progress") return t("Continue visit");
	if (status === "Correction Required") return t("Fix and resubmit");
	return t("Open visit");
});
const nextStatus = computed(() => STATUS[nextUp.value?.visit_status] || { label: nextUp.value?.visit_status, tone: "muted" });

// Ask for the phone permissions once, after sign-in, with the reasons in front of the engineer.
const permissionsOpen = ref(false);
function closePermissions() {
	permissionsOpen.value = false;
	markAsked();
}

onMounted(() => {
	syncNow();
	loadAlerts();
	if (!wasAsked()) permissionsOpen.value = true;
});
</script>

<template>
	<div class="flex h-full flex-col">
		<!-- Top bar: brand, sync state, alerts -->
		<header class="z-10 shrink-0 bg-surface" :class="session.online && !pwa.updateReady ? 'pt-safe-top' : ''">
			<div class="mx-auto flex h-[var(--header-height)] max-w-xl items-center gap-2 px-4">
				<img :src="logo" alt="" width="34" height="34" class="h-[34px] w-[34px] rounded-[10px]" />
				<span class="ltr text-lg font-extrabold tracking-tight text-brand-strong">C-WATER</span>
				<span class="flex-1"></span>
				<SyncChip />
				<button type="button" class="icon-btn" aria-label="Refresh" @click="syncNow">
					<RotateCw :size="21" :class="visits.loadingList ? 'spin' : ''" aria-hidden="true" />
				</button>
				<RouterLink :to="{ name: 'alerts' }" class="icon-btn relative" aria-label="Alerts">
					<Bell :size="22" aria-hidden="true" />
					<span v-if="alerts.unread" class="absolute end-2 top-2 h-2.5 w-2.5 rounded-full bg-bad ring-2 ring-surface">
						<span class="sr-only">unread</span>
					</span>
				</RouterLink>
			</div>
		</header>

		<div class="scroll-area min-h-0 flex-1">
			<div class="mx-auto max-w-xl space-y-4 px-4 pb-24 pt-4">
				<!-- Greeting and the next thing to do -->
				<section class="card p-5" aria-label="Next visit">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="text-[22px] leading-tight text-ink">{{ greeting }}</p>
							<h1 class="truncate text-[26px] font-extrabold leading-tight text-ink">{{ session.boot?.full_name }}</h1>
						</div>
						<span
							class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-soft text-lg font-extrabold text-brand-strong"
							aria-hidden="true"
						>
							{{ initials(session.boot?.full_name) }}
						</span>
					</div>

					<template v-if="nextUp">
						<div class="mt-4 rounded-control bg-sunken p-4">
							<div class="flex items-center justify-between gap-2">
								<span class="text-sm font-semibold text-ink-2">Next up</span>
								<Pill :tone="nextStatus.tone" dot>{{ t(nextStatus.label) }}</Pill>
							</div>
							<h2 class="mt-1.5 text-xl font-extrabold text-ink">{{ nextUp.customer_name || nextUp.customer }}</h2>
							<p class="font-medium text-ink-2">{{ nextUp.visit_type }}</p>
							<p v-if="nextUp.site?.location_name" class="mt-2 flex items-center gap-1.5 text-sm text-ink-2">
								<MapPin :size="16" class="shrink-0 text-ink-3" aria-hidden="true" />
								<span class="truncate">{{ nextUp.site.location_name }}</span>
							</p>
							<p class="mt-1 text-sm font-bold text-brand-strong">
								{{ dayLabel(nextUp.planned_date) }}<template v-if="nextUp.planned_start_time"> · {{ timeLabel(nextUp.planned_start_time) }}</template>
							</p>
						</div>
						<RouterLink :to="{ name: 'visit', params: { name: nextUp.name } }" class="btn-primary btn-block mt-4">
							<Play :size="18" aria-hidden="true" />
							{{ nextAction }}
						</RouterLink>
					</template>

					<EmptyState
						v-else
						:icon="CalendarCheck2"
						:title="t('Nothing waiting for you')"
						:text="visits.listLoadedAt ? t('New visits appear here as soon as they are assigned.') : t('Connect to the internet to load your visits.')"
					/>
				</section>

				<!-- Counts -->
				<section class="grid grid-cols-3 gap-3" aria-label="Summary">
					<RouterLink :to="{ name: 'visits', query: { filter: 'today' } }" class="card px-2 py-4 text-center active:scale-[0.98]">
						<p class="numeric text-[28px] font-extrabold leading-none text-brand-strong">{{ counts.today }}</p>
						<p class="mt-1.5 text-xs font-semibold text-ink-2">Today</p>
					</RouterLink>
					<RouterLink :to="{ name: 'visits', query: { filter: 'open' } }" class="card px-2 py-4 text-center active:scale-[0.98]">
						<p class="numeric text-[28px] font-extrabold leading-none text-brand-strong">{{ counts.open }}</p>
						<p class="mt-1.5 text-xs font-semibold text-ink-2">To do</p>
					</RouterLink>
					<RouterLink :to="{ name: 'visits', query: { filter: 'done' } }" class="card px-2 py-4 text-center active:scale-[0.98]">
						<p class="numeric text-[28px] font-extrabold leading-none text-brand-strong">{{ counts.review }}</p>
						<p class="mt-1.5 text-xs font-semibold text-ink-2">In review</p>
					</RouterLink>
				</section>

				<!-- Shortcuts -->
				<section class="card overflow-hidden" aria-label="Shortcuts">
					<RouterLink :to="{ name: 'visits', query: { filter: 'open' } }" class="link-row">
						<span class="icon-tile" aria-hidden="true"><ClipboardCheck :size="22" /></span>
						<span class="min-w-0 flex-1">
							<span class="block font-bold text-ink">My visits</span>
							<span class="block text-sm text-ink-2">{{ t("{count} to do", { count: counts.open }) }}</span>
						</span>
						<ChevronRight :size="20" class="text-brand-strong" aria-hidden="true" />
					</RouterLink>
					<RouterLink v-if="unsynced" :to="{ name: 'sync' }" class="link-row border-t border-line">
						<span class="icon-tile tone-warn" aria-hidden="true"><CloudUpload :size="22" /></span>
						<span class="min-w-0 flex-1">
							<span class="block font-bold text-ink">Waiting to sync</span>
							<span class="block text-sm text-ink-2">{{ t("{count} change(s) not sent yet", { count: unsynced }) }}</span>
						</span>
						<ChevronRight :size="20" class="text-brand-strong" aria-hidden="true" />
					</RouterLink>
				</section>

				<section v-if="todays.length" aria-labelledby="home-today">
					<h2 id="home-today" class="section-title">Also today</h2>
					<div class="space-y-3">
						<VisitCard v-for="visit in todays" :key="visit.name" :visit="visit" :show-date="false" />
					</div>
				</section>

				<section v-if="upcoming.length" aria-labelledby="home-upcoming">
					<div class="mb-1 flex items-center justify-between px-1">
						<h2 id="home-upcoming" class="section-title mb-0 px-0">Coming up</h2>
						<RouterLink :to="{ name: 'visits', query: { filter: 'open' } }" class="inline-flex min-h-[44px] items-center gap-1 text-sm font-bold text-brand-strong">
							View all
							<ChevronRight :size="16" aria-hidden="true" />
						</RouterLink>
					</div>
					<div class="space-y-3">
						<VisitCard v-for="visit in upcoming" :key="visit.name" :visit="visit" />
					</div>
				</section>

				<p v-if="visits.listLoadedAt" class="text-center text-xs text-ink-3">
					{{ t("Visits updated {when}", { when: ago(visits.listLoadedAt) }) }}
				</p>
				<p v-if="visits.listError" class="rounded-control px-4 py-3 text-sm font-semibold tone-bad" role="alert">
					{{ visits.listError }}
				</p>
			</div>
		</div>

		<BottomSheet :open="permissionsOpen" :title="t('Allow the app to work on site')" @close="closePermissions">
			<p class="pb-1 text-ink-2">These let the app record a visit properly. You can change them later in Profile.</p>
			<PermissionsList />
			<template #footer>
				<button type="button" class="btn-primary btn-block" @click="closePermissions">Done</button>
			</template>
		</BottomSheet>
	</div>
</template>
