<script setup>
import { ChevronRight, CircleAlert, Clock, CloudUpload, MapPin } from "@lucide/vue";
import { computed } from "vue";

import { dayLabel, PRIORITY_TONE, STATUS, timeLabel } from "@/lib/format";

import Pill from "./Pill.vue";

const props = defineProps({
	visit: { type: Object, required: true },
	/** Show the date; the Home list is already "today", so it hides it. */
	showDate: { type: Boolean, default: true },
});

const status = computed(() => STATUS[props.visit.visit_status] || { label: props.visit.visit_status, tone: "muted" });
const when = computed(() => {
	const parts = [];
	if (props.showDate) parts.push(dayLabel(props.visit.planned_date));
	if (props.visit.planned_start_time) parts.push(timeLabel(props.visit.planned_start_time));
	return parts.join(" · ");
});
const place = computed(() => props.visit.site?.location_name || props.visit.site?.address_display || "");
const urgent = computed(() => ["High", "Critical"].includes(props.visit.priority));
</script>

<template>
	<RouterLink
		:to="{ name: 'visit', params: { name: visit.name } }"
		class="card flex items-stretch gap-3 p-4 transition-transform active:scale-[0.99]"
	>
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-1.5">
				<Pill :tone="status.tone" dot>{{ status.label }}</Pill>
				<Pill v-if="urgent" :tone="PRIORITY_TONE[visit.priority]">{{ visit.priority }}</Pill>
				<Pill v-if="visit.failed" tone="bad">
					<CircleAlert :size="12" aria-hidden="true" />
					Needs attention
				</Pill>
				<Pill v-else-if="visit.pending || visit.isLocal" tone="warn">
					<CloudUpload :size="12" aria-hidden="true" />
					Not synced
				</Pill>
			</div>

			<h3 class="mt-2 truncate text-[17px] font-bold text-ink">{{ visit.customer_name || visit.customer }}</h3>
			<p class="truncate text-sm font-medium text-ink-2">{{ visit.visit_type }}</p>

			<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
				<span v-if="when" class="inline-flex items-center gap-1.5">
					<Clock :size="15" class="text-ink-3" aria-hidden="true" />
					{{ when }}
				</span>
				<span v-if="place" class="inline-flex min-w-0 items-center gap-1.5">
					<MapPin :size="15" class="shrink-0 text-ink-3" aria-hidden="true" />
					<span class="truncate">{{ place }}</span>
				</span>
			</div>
		</div>
		<ChevronRight :size="20" class="shrink-0 self-center text-ink-3" aria-hidden="true" />
	</RouterLink>
</template>
