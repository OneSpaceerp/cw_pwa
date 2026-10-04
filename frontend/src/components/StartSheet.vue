<script setup>
/**
 * Check-in: read the device position, show how it compares with the site, and ask
 * for a reason when it cannot be verified. The server repeats the comparison and
 * its result is the one that is stored.
 */
import { LoaderCircle, LocateFixed, MapPin, RotateCw } from "@lucide/vue";
import { computed, ref, watch } from "vue";

import { getPosition } from "@/lib/device";
import { distanceLabel, GEOFENCE_TONE } from "@/lib/format";
import { evaluateGeofence } from "@/lib/rules";
import { settings } from "@/stores/session";

import BottomSheet from "./BottomSheet.vue";

const props = defineProps({
	open: { type: Boolean, default: false },
	/** The site to compare against: { latitude, longitude, geofence_radius_meters, verification_status }. */
	site: { type: Object, default: null },
	title: { type: String, default: "Start visit" },
	confirmLabel: { type: String, default: "Start visit" },
	busy: { type: Boolean, default: false },
});
const emit = defineEmits(["close", "confirm"]);

const locating = ref(false);
const position = ref(null);
const gpsError = ref("");
const reason = ref("");

async function locate() {
	locating.value = true;
	gpsError.value = "";
	try {
		position.value = await getPosition();
	} catch (error) {
		position.value = null;
		gpsError.value = error.message;
	} finally {
		locating.value = false;
	}
}

watch(
	() => props.open,
	(open) => {
		if (!open) return;
		reason.value = "";
		locate();
	}
);

const estimate = computed(() => evaluateGeofence(position.value, props.site, settings()));
const blockedWithoutGps = computed(() => !position.value && !settings().allow_checkin_without_gps);
const reasonRequired = computed(
	() => estimate.value.status === "Exception" && Boolean(settings().require_reason_for_gps_exception)
);
const canConfirm = computed(
	() => !locating.value && !blockedWithoutGps.value && (!reasonRequired.value || reason.value.trim().length >= 3)
);

const headline = computed(() => {
	if (!position.value) return "No location captured";
	const { status, distance } = estimate.value;
	if (distance === null) return "This site has no saved coordinates to compare with";
	if (status === "Verified") return `You are at the site (${distanceLabel(distance)} away)`;
	if (status === "Warning") {
		return props.site?.verification_status === "Pending Verification"
			? "This site's location has not been confirmed by a supervisor yet"
			: `You are near the site (${distanceLabel(distance)} away)`;
	}
	return `You are ${distanceLabel(distance)} from the site`;
});
</script>

<template>
	<BottomSheet :open="open" :title="title" @close="emit('close')">
		<div class="space-y-4 pt-1">
			<div class="rounded-card border border-line p-4" :class="locating ? 'bg-sunken' : `tone-${GEOFENCE_TONE[estimate.status]}`" aria-live="polite">
				<div v-if="locating" class="flex items-center gap-3 font-semibold text-ink-2">
					<LoaderCircle :size="22" class="spin" aria-hidden="true" />
					Getting your location
				</div>
				<template v-else>
					<p class="flex items-start gap-2 font-bold">
						<component :is="position ? LocateFixed : MapPin" :size="20" class="mt-0.5 shrink-0" aria-hidden="true" />
						{{ headline }}
					</p>
					<p v-if="position?.accuracy" class="mt-1 pl-7 text-sm font-medium">
						GPS accuracy about <span class="numeric">{{ Math.round(position.accuracy) }} m</span>
					</p>
					<p v-if="gpsError" class="mt-1 pl-7 text-sm font-medium">{{ gpsError }}</p>
				</template>
			</div>

			<button v-if="!locating" type="button" class="btn-quiet btn-block" @click="locate">
				<RotateCw :size="18" aria-hidden="true" />
				Read location again
			</button>

			<div v-if="!locating && estimate.status === 'Exception' && !blockedWithoutGps">
				<label class="field-label" for="start-reason">
					Why can the location not be verified?
					<span v-if="reasonRequired" class="text-bad" aria-hidden="true">*</span>
				</label>
				<textarea
					id="start-reason"
					v-model="reason"
					class="field min-h-[88px] resize-none"
					rows="3"
					placeholder="e.g. No signal inside the plant room"
				></textarea>
				<p class="mt-1.5 text-sm text-ink-3">Your supervisor sees this when reviewing the visit.</p>
			</div>

			<p v-if="blockedWithoutGps && !locating" class="rounded-control px-4 py-3 text-sm font-semibold tone-bad" role="alert">
				A location is required to start a visit. Turn on location and try again.
			</p>

			<p class="text-sm text-ink-3">The time is recorded by the server when the visit starts.</p>
		</div>

		<template #footer>
			<button type="button" class="btn-primary btn-block" :disabled="!canConfirm || busy" @click="emit('confirm', { position, reason: reason.trim() })">
				<LoaderCircle v-if="busy" :size="20" class="spin" aria-hidden="true" />
				{{ confirmLabel }}
			</button>
		</template>
	</BottomSheet>
</template>
