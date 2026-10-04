<script setup>
import { Building2, CircleAlert, Clock, FileText, History, Info, MapPin, Navigation, Phone, Play, RotateCw } from "@lucide/vue";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import EmptyState from "@/components/EmptyState.vue";
import PageHeader from "@/components/PageHeader.vue";
import Pill from "@/components/Pill.vue";
import StartSheet from "@/components/StartSheet.vue";
import SyncChip from "@/components/SyncChip.vue";
import { call } from "@/lib/api";
import { directionsUrl, vibrate } from "@/lib/device";
import { t } from "@/lib/i18n";
import { dateTimeLabel, dayLabel, distanceLabel, durationLabel, GEOFENCE_TONE, PRIORITY_TONE, STATUS, timeLabel } from "@/lib/format";
import { hasCoordinates } from "@/lib/rules";
import { isLocalId } from "@/stores/outbox";
import { session } from "@/stores/session";
import { toastError } from "@/stores/ui";
import { clearServerError, hasUnsynced, openVisit, refreshVisit, startVisit, visits } from "@/stores/visits";

const props = defineProps({ name: { type: String, required: true } });
const router = useRouter();

const record = computed(() => visits.records[props.name]);
const data = computed(() => record.value?.data);
const loadError = ref("");
const refreshing = ref(false);
const startOpen = ref(false);
const starting = ref(false);
const history = ref(null);

const status = computed(() => STATUS[data.value?.visit_status] || { label: data.value?.visit_status, tone: "muted" });
const site = computed(() => data.value?.site);
const canNavigate = computed(() => site.value && hasCoordinates(site.value.latitude, site.value.longitude));
const unsynced = computed(() => hasUnsynced(props.name));

const action = computed(() => {
	switch (data.value?.visit_status) {
		case "Planned":
			return { label: "Start visit", icon: Play, run: () => (startOpen.value = true) };
		case "In Progress":
			return { label: "Continue visit", icon: Play, run: openRun };
		case "Correction Required":
			return { label: "Fix and resubmit", icon: Play, run: openRun };
		default:
			return { label: "View what was recorded", icon: FileText, run: openRun, quiet: true };
	}
});

function openRun() {
	router.push({ name: "visit-run", params: { name: props.name } });
}

async function confirmStart({ position, reason }) {
	starting.value = true;
	try {
		await startVisit(props.name, { position, reason });
		vibrate(15);
		startOpen.value = false;
		openRun();
	} catch (error) {
		toastError(error, "The visit could not be started.");
	} finally {
		starting.value = false;
	}
}

async function refresh() {
	if (unsynced.value) return;
	refreshing.value = true;
	try {
		await refreshVisit(props.name);
	} catch (error) {
		if (!error.network) toastError(error);
	} finally {
		refreshing.value = false;
	}
}

async function loadHistory() {
	if (!session.online || isLocalId(props.name)) return;
	try {
		history.value = await call("cw_visit.api.v1.site_history", { name: props.name, limit: 5 });
	} catch {
		history.value = null;
	}
}

onMounted(async () => {
	try {
		await openVisit(props.name);
	} catch (error) {
		loadError.value = error.network ? "This visit is not saved on this phone. Connect to the internet to open it." : error.message;
		return;
	}
	loadHistory();
});
</script>

<template>
	<div class="flex h-full flex-col">
		<PageHeader back :fallback="{ name: 'visits' }" :title="data?.customer_name || 'Visit'" :subtitle="isLocalId(name) ? 'Not synced yet' : name">
			<template #actions>
				<SyncChip />
				<button v-if="!unsynced" type="button" class="icon-btn" aria-label="Refresh" :disabled="refreshing" @click="refresh">
					<RotateCw :size="20" :class="refreshing ? 'spin' : ''" aria-hidden="true" />
				</button>
			</template>
		</PageHeader>

		<div class="scroll-area min-h-0 flex-1">
			<div class="mx-auto max-w-xl space-y-4 px-4 pb-8 pt-4">
				<EmptyState v-if="loadError" :icon="CircleAlert" title="Cannot open this visit" :text="loadError">
					<button type="button" class="btn-secondary" @click="router.replace({ name: 'visits' })">Back to visits</button>
				</EmptyState>

				<div v-else-if="!data" class="space-y-3" aria-busy="true">
					<div class="skeleton h-32"></div>
					<div class="skeleton h-40"></div>
				</div>

				<template v-else>
					<div v-if="record.serverError" class="rounded-card p-4 tone-bad" role="alert">
						<p class="font-bold">The server did not accept the last change</p>
						<p class="mt-1 whitespace-pre-line text-sm font-medium">{{ record.serverError }}</p>
						<button type="button" class="mt-2 min-h-[44px] text-sm font-bold underline" @click="clearServerError(name)">Dismiss</button>
					</div>

					<!-- Supervisor's feedback comes first when the visit was sent back. -->
					<div v-if="data.visit_status === 'Correction Required' || data.visit_status === 'Rejected'" class="rounded-card p-4 tone-bad">
						<p class="font-bold">{{ data.visit_status === "Rejected" ? "Rejected by your supervisor" : "Your supervisor asked for a correction" }}</p>
						<p v-if="data.supervisor_remarks" class="mt-1 whitespace-pre-line font-medium">{{ data.supervisor_remarks }}</p>
					</div>

					<!-- Summary -->
					<section class="card p-5">
						<div class="flex flex-wrap items-center gap-1.5">
							<Pill :tone="status.tone" dot>{{ status.label }}</Pill>
							<Pill :tone="PRIORITY_TONE[data.priority] || 'muted'">{{ t("{priority} priority", { priority: t(data.priority) }) }}</Pill>
							<Pill v-if="data.creation_source === 'Engineer On-Site'" tone="muted">Logged on site</Pill>
						</div>
						<h2 class="mt-3 text-xl font-extrabold text-ink">{{ data.visit_type }}</h2>
						<p class="mt-1 flex items-center gap-1.5 font-medium text-ink-2">
							<Clock :size="16" class="text-ink-3" aria-hidden="true" />
							{{ dayLabel(data.planned_date) }}
							<template v-if="data.planned_start_time">
								· {{ timeLabel(data.planned_start_time) }}<template v-if="data.planned_end_time"> to {{ timeLabel(data.planned_end_time) }}</template>
							</template>
						</p>
						<p v-if="data.description" class="mt-3 whitespace-pre-line text-ink">{{ data.description }}</p>
					</section>

					<!-- Site -->
					<section v-if="site" class="card p-5" aria-labelledby="visit-site">
						<h2 id="visit-site" class="section-title px-0">Site</h2>
						<p class="flex items-start gap-2 font-bold text-ink">
							<Building2 :size="18" class="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
							{{ site.location_name }}
						</p>
						<p v-if="site.address_display" class="mt-1 flex items-start gap-2 text-ink-2">
							<MapPin :size="18" class="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
							<span class="whitespace-pre-line">{{ site.address_display }}</span>
						</p>
						<p v-if="site.operating_hours" class="mt-1 ps-[26px] text-sm text-ink-2">Open: {{ site.operating_hours }}</p>
						<p v-if="site.verification_status === 'Pending Verification'" class="mt-3 rounded-control px-3 py-2 text-sm font-semibold tone-warn">
							This site's location is waiting for a supervisor to confirm it.
						</p>

						<div class="mt-4 grid grid-cols-2 gap-3">
							<a v-if="canNavigate" :href="directionsUrl(site.latitude, site.longitude)" target="_blank" rel="noopener" class="btn-secondary">
								<Navigation :size="18" aria-hidden="true" />
								Directions
							</a>
							<a v-if="site.primary_contact_phone" :href="`tel:${site.primary_contact_phone}`" class="btn-secondary">
								<Phone :size="18" aria-hidden="true" />
								{{ t("Call {name}", { name: (site.primary_contact_person || t("contact")).split(" ")[0] }) }}
							</a>
						</div>

						<div v-if="site.special_site_instructions" class="mt-4 rounded-control p-3 tone-info">
							<p class="flex items-center gap-1.5 text-sm font-bold">
								<Info :size="16" aria-hidden="true" />
								Site instructions
							</p>
							<p class="mt-1 whitespace-pre-line text-sm font-medium">{{ site.special_site_instructions }}</p>
						</div>
					</section>

					<!-- Linked request -->
					<section v-if="data.request" class="card p-5" aria-labelledby="visit-request">
						<h2 id="visit-request" class="section-title px-0">{{ t("Service request") }} <span class="ltr">{{ data.request.name }}</span></h2>
						<p class="whitespace-pre-line text-ink">{{ data.request.issue_description }}</p>
						<p v-if="data.request.response_due_date" class="mt-2 text-sm font-semibold" :class="data.request.sla_breached ? 'text-bad' : 'text-ink-2'">
							Response due {{ dateTimeLabel(data.request.response_due_date) }}<template v-if="data.request.sla_breached"> (overdue)</template>
						</p>
					</section>

					<!-- Check-in evidence -->
					<section v-if="data.checkin_time" class="card p-5" aria-labelledby="visit-checkin">
						<h2 id="visit-checkin" class="section-title px-0">On site</h2>
						<dl class="space-y-2 text-ink">
							<div class="flex justify-between gap-3">
								<dt class="text-ink-2">Checked in</dt>
								<dd class="font-semibold">{{ dateTimeLabel(data.checkin_time) }}</dd>
							</div>
							<div class="flex items-center justify-between gap-3">
								<dt class="text-ink-2">Location check</dt>
								<dd>
									<Pill :tone="GEOFENCE_TONE[data.geofence_status] || 'muted'" dot>
										{{ data.geofence_status }}<template v-if="data.distance_to_site_meters != null && data.checkin_latitude"> · {{ distanceLabel(data.distance_to_site_meters) }}</template>
									</Pill>
								</dd>
							</div>
							<div v-if="data.geofence_reason" class="text-sm text-ink-2">Reason given: {{ data.geofence_reason }}</div>
							<div v-if="data.checkout_time" class="flex justify-between gap-3">
								<dt class="text-ink-2">Checked out</dt>
								<dd class="font-semibold">{{ dateTimeLabel(data.checkout_time) }}</dd>
							</div>
							<div v-if="data.visit_duration_minutes" class="flex justify-between gap-3">
								<dt class="text-ink-2">Time on site</dt>
								<dd class="font-semibold">{{ durationLabel(data.visit_duration_minutes) }}</dd>
							</div>
						</dl>
					</section>

					<!-- Site history -->
					<section v-if="history?.length" aria-labelledby="visit-history">
						<h2 id="visit-history" class="section-title flex items-center gap-1.5">
							<History :size="14" aria-hidden="true" />
							Previous visits to this site
						</h2>
						<ul class="card-outline divide-y divide-line">
							<li v-for="item in history" :key="item.name" class="px-4 py-3">
								<div class="flex items-center justify-between gap-3">
									<p class="font-semibold text-ink">{{ dayLabel(item.planned_date) }} · {{ item.visit_type }}</p>
									<Pill tone="muted">{{ item.outcome }}</Pill>
								</div>
								<p v-if="item.readings?.length" class="mt-1 text-sm text-ink-2">
									<span v-for="(reading, position) in item.readings.slice(0, 4)" :key="position" class="numeric">
										<template v-if="position"> · </template>{{ reading.parameter_name }} {{ reading.reading_value }}{{ reading.unit ? " " + reading.unit : "" }}
									</span>
								</p>
							</li>
						</ul>
					</section>
				</template>
			</div>
		</div>

		<footer v-if="data" class="z-10 shrink-0 bg-surface px-4 pb-[calc(theme(spacing.safe-bottom)+12px)] pt-3 shadow-bar">
			<div class="mx-auto max-w-xl">
				<button type="button" class="btn-block min-h-[56px] text-lg" :class="action.quiet ? 'btn-secondary' : 'btn-primary'" @click="action.run">
					<component :is="action.icon" :size="20" aria-hidden="true" />
					{{ action.label }}
				</button>
			</div>
		</footer>

		<StartSheet :open="startOpen" :site="site" :busy="starting" @close="startOpen = false" @confirm="confirmStart" />
	</div>
</template>
