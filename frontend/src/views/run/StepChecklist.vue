<script setup>
import { ListChecks } from "@lucide/vue";
import { computed } from "vue";

import EmptyState from "@/components/EmptyState.vue";
import { edit } from "@/stores/visits";

const props = defineProps({
	record: { type: Object, required: true },
	readonly: { type: Boolean, default: false },
});

const rows = computed(() => props.record.data.checklist_items || []);
const answered = computed(() => rows.value.filter(isAnswered).length);

function isAnswered(row) {
	return Boolean((row.response || "").trim() || String(row.response_value ?? "").trim());
}

// The template decides how an item is answered; older rows without a type are pass/fail.
function choices(row) {
	if (row.response_type === "Yes/No") return ["Yes", "No", "N/A"];
	if (row.response_type === "Numeric Value" || row.response_type === "Text") return null;
	return ["Pass", "Fail", "N/A"];
}

const TONE = { Pass: "ok", Yes: "ok", Fail: "bad", No: "bad", "N/A": "muted" };

function set(row, field, value) {
	if (props.readonly) return;
	edit(props.record.name, (data) => {
		const target = data.checklist_items.find((item) => item._key === row._key);
		// Tapping the selected answer again clears it.
		target[field] = field === "response" && target.response === value ? "" : value;
	});
}
</script>

<template>
	<section>
		<EmptyState
			v-if="!rows.length"
			:icon="ListChecks"
			title="No checklist for this visit"
			text="This service type has no checklist template. Continue to the readings."
		/>

		<template v-else>
			<p class="mb-3 px-1 text-sm font-semibold text-ink-2">
				<span class="numeric">{{ answered }} of {{ rows.length }}</span> answered
			</p>

			<ol class="space-y-3">
				<li v-for="(row, index) in rows" :key="row._key" class="card p-4">
					<div class="flex gap-3">
						<span
							class="numeric flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
							:class="isAnswered(row) ? 'tone-ok' : 'tone-muted'"
							aria-hidden="true"
						>
							{{ index + 1 }}
						</span>
						<div class="min-w-0 flex-1">
							<p class="font-semibold text-ink">
								{{ row.checklist_item }}
								<span v-if="row.is_mandatory" class="text-bad" title="Required">*</span>
							</p>
							<p v-if="row.guidance" class="mt-0.5 text-sm text-ink-2">{{ row.guidance }}</p>
						</div>
					</div>

					<div v-if="choices(row)" class="mt-3 grid grid-cols-3 gap-2" role="radiogroup" :aria-label="row.checklist_item">
						<button
							v-for="choice in choices(row)"
							:key="choice"
							type="button"
							role="radio"
							:aria-checked="row.response === choice"
							:disabled="readonly"
							class="min-h-[48px] rounded-control border text-sm font-bold transition-colors"
							:class="row.response === choice ? `tone-${TONE[choice]} border-current` : 'border-line bg-surface text-ink-2'"
							@click="set(row, 'response', choice)"
						>
							{{ choice }}
						</button>
					</div>
					<input
						v-else
						class="field mt-3"
						:value="row.response_value"
						:inputmode="row.response_type === 'Numeric Value' ? 'decimal' : 'text'"
						:placeholder="row.response_type === 'Numeric Value' ? 'Enter the value' : 'Enter the answer'"
						:aria-label="row.checklist_item"
						:readonly="readonly"
						@input="set(row, 'response_value', $event.target.value)"
					/>

					<!-- A failed item should say why, so the note opens by itself. -->
					<input
						v-if="row.remarks || ['Fail', 'No'].includes(row.response)"
						class="field mt-2"
						:value="row.remarks"
						placeholder="Note (what was wrong?)"
						:aria-label="`Note for ${row.checklist_item}`"
						:readonly="readonly"
						@input="set(row, 'remarks', $event.target.value)"
					/>
				</li>
			</ol>
			<p class="mt-3 px-1 text-sm text-ink-3"><span class="text-bad">*</span> must be answered before the visit can be submitted.</p>
		</template>
	</section>
</template>
