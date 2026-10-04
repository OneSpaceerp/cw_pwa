<script setup>
import { CircleAlert, CircleCheck, LoaderCircle, Send } from "@lucide/vue";
import { computed, reactive, ref } from "vue";

import SignaturePad from "@/components/SignaturePad.vue";
import { getPosition, vibrate } from "@/lib/device";
import { t } from "@/lib/i18n";
import { OUTCOMES_NEEDING_SUMMARY, reviewBlockers } from "@/lib/rules";
import { options } from "@/stores/masters";
import { session, settings } from "@/stores/session";
import { toast } from "@/stores/ui";
import { edit, photoCount, submitVisit } from "@/stores/visits";

const props = defineProps({
	record: { type: Object, required: true },
});
const emit = defineEmits(["goto", "submitted"]);

const data = computed(() => props.record.data);
const outcomes = computed(() => {
	const list = options("outcome").filter((item) => item !== "Cancelled");
	return list.length ? list : ["Resolved", "Partially Resolved", "Not Resolved", "Follow-up Required", "Customer Unavailable"];
});

const form = reactive({
	outcome: data.value.outcome || "",
	signature: "",
});
const submitting = ref(false);
const stage = ref("");

// Text fields write straight into the working copy, so they survive leaving this step.
const text = (field) =>
	computed({
		get: () => data.value[field] || "",
		set: (value) => edit(props.record.name, (visit) => (visit[field] = value)),
	});
const summary = text("executive_summary");
const representative = text("customer_representative");
const phone = text("customer_representative_phone");

const counts = computed(() => [
	{ step: "checklist", label: "Checklist", value: `${(data.value.checklist_items || []).filter((row) => row.response || row.response_value).length}/${(data.value.checklist_items || []).length}` },
	{ step: "readings", label: "Readings", value: (data.value.readings || []).length },
	{ step: "findings", label: "Findings", value: (data.value.findings || []).length },
	{ step: "photos", label: "Photos", value: photoCount(props.record) },
	{ step: "work", label: "Work items", value: (data.value.operations || []).length },
	{ step: "needs", label: "Requests", value: (data.value.requirements || []).length + (data.value.expenses || []).length },
]);

const blockers = computed(() =>
	reviewBlockers(data.value, {
		outcome: form.outcome,
		summary: summary.value,
		photoCount: photoCount(props.record),
		settings: settings(),
	})
);
const summaryRequired = computed(() => OUTCOMES_NEEDING_SUMMARY.includes(form.outcome));

async function submit() {
	if (blockers.value.length || submitting.value) return;
	submitting.value = true;

	// Check-out position. Its absence never blocks a submission: the server records
	// the check-out without coordinates and the supervisor sees that.
	stage.value = t("Getting your location");
	let position = null;
	try {
		position = await getPosition({ timeout: 10000 });
	} catch {
		position = null;
	}

	stage.value = t("Saving");
	try {
		await submitVisit(props.record.name, {
			outcome: form.outcome,
			summary: summary.value,
			representative: representative.value,
			phone: phone.value,
			signature: form.signature,
			position,
		});
		vibrate([12, 60, 12]);
		toast(
			session.online ? t("Visit sent for review.") : t("Visit saved. It will be sent for review when you are back online."),
			"ok"
		);
		emit("submitted");
	} catch (error) {
		toast(error.message || "The visit could not be saved.", "bad");
	} finally {
		submitting.value = false;
		stage.value = "";
	}
}
</script>

<template>
	<section class="space-y-5">
		<div>
			<h2 class="section-title">What you recorded</h2>
			<div class="grid grid-cols-3 gap-2">
				<button
					v-for="item in counts"
					:key="item.step"
					type="button"
					class="card px-2 py-3 text-center active:scale-[0.98]"
					@click="emit('goto', item.step)"
				>
					<span class="numeric block text-xl font-extrabold text-ink">{{ item.value }}</span>
					<span class="block text-xs font-semibold text-ink-2">{{ item.label }}</span>
				</button>
			</div>
		</div>

		<div class="card space-y-4 p-4">
			<div>
				<label class="field-label" for="review-outcome">Outcome <span class="text-bad" aria-hidden="true">*</span></label>
				<select id="review-outcome" v-model="form.outcome" class="field">
					<option value="" disabled>Select the outcome</option>
					<option v-for="item in outcomes" :key="item" :value="item">{{ item }}</option>
				</select>
			</div>

			<div>
				<label class="field-label" for="review-summary">
					Summary
					<span v-if="summaryRequired" class="text-bad" aria-hidden="true">*</span>
					<span v-else class="font-medium text-ink-3">(optional)</span>
				</label>
				<textarea
					id="review-summary"
					v-model="summary"
					class="field min-h-[120px] resize-none"
					rows="4"
					placeholder="What was done, what was found, what happens next"
				></textarea>
				<p class="mt-1.5 text-sm text-ink-3">This appears on the service report the customer receives.</p>
			</div>
		</div>

		<div class="card space-y-4 p-4">
			<h2 class="text-base font-bold text-ink">Customer sign-off <span class="text-sm font-medium text-ink-3">(optional)</span></h2>
			<div>
				<label class="field-label" for="review-rep">Customer representative</label>
				<input id="review-rep" v-model="representative" class="field" autocomplete="off" placeholder="Name" />
			</div>
			<div>
				<label class="field-label" for="review-phone">Phone</label>
				<input id="review-phone" v-model="phone" class="field" type="tel" inputmode="tel" autocomplete="off" />
			</div>
			<div>
				<span class="field-label">Signature</span>
				<SignaturePad v-model="form.signature" />
			</div>
		</div>

		<div v-if="blockers.length" class="rounded-card border border-line p-4 tone-warn" role="status">
			<p class="flex items-center gap-2 font-bold">
				<CircleAlert :size="18" aria-hidden="true" />
				{{ t("{count} thing(s) to finish before submitting", { count: blockers.length }) }}
			</p>
			<ul class="mt-2 space-y-1">
				<li v-for="(item, index) in blockers" :key="index">
					<button type="button" class="min-h-[44px] w-full text-start text-sm font-semibold underline decoration-dotted underline-offset-4" @click="emit('goto', item.step)">
						{{ item.text }}
					</button>
				</li>
			</ul>
		</div>
		<p v-else class="flex items-center gap-2 rounded-card px-4 py-3 font-semibold tone-ok">
			<CircleCheck :size="18" aria-hidden="true" />
			Everything needed is filled in.
		</p>

		<button type="button" class="btn-primary btn-block min-h-[56px] text-lg" :disabled="Boolean(blockers.length) || submitting" @click="submit">
			<LoaderCircle v-if="submitting" :size="22" class="spin" aria-hidden="true" />
			<Send v-else :size="20" aria-hidden="true" />
			{{ submitting ? stage : "Submit for review" }}
		</button>
		<p class="text-center text-sm text-ink-3">
			After submitting, the visit is locked until your supervisor reviews it.
		</p>
	</section>
</template>
