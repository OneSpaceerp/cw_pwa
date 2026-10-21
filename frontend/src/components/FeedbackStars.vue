<script setup>
// 1 to 5 stars. Large targets: the customer uses it on the engineer's phone.
import { Star } from "@lucide/vue";
import { computed } from "vue";

import { t } from "@/lib/i18n";

const props = defineProps({
	modelValue: { type: Number, default: 0 },
	readonly: { type: Boolean, default: false },
	size: { type: Number, default: 40 },
	labelledby: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue"]);

const WORDS = ["Very poor", "Poor", "Fair", "Good", "Excellent"];
const word = computed(() => (props.modelValue ? t(WORDS[props.modelValue - 1]) : ""));

function pick(value) {
	if (props.readonly) return;
	emit("update:modelValue", value);
	navigator.vibrate?.(8);
}
</script>

<template>
	<div>
		<!-- Stars always run left to right, also in Arabic, so "more stars" reads the same way. -->
		<div class="flex justify-center gap-1" dir="ltr" :role="readonly ? 'img' : 'radiogroup'"
			:aria-labelledby="labelledby || undefined" :aria-label="readonly ? `${modelValue} / 5` : undefined">
			<component
				:is="readonly ? 'span' : 'button'"
				v-for="value in 5"
				:key="value"
				:type="readonly ? undefined : 'button'"
				:role="readonly ? undefined : 'radio'"
				:aria-checked="readonly ? undefined : String(modelValue === value)"
				:aria-label="readonly ? undefined : `${value} - ${t(WORDS[value - 1])}`"
				class="grid place-items-center rounded-xl"
				:class="readonly ? '' : 'min-h-[52px] min-w-[52px] active:scale-90 transition-transform'"
				@click="pick(value)"
			>
				<Star
					:size="size"
					:stroke-width="1.6"
					:class="value <= modelValue ? 'fill-[#f5a524] text-[#f5a524]' : 'text-[#f5a524]/70'"
					aria-hidden="true"
				/>
			</component>
		</div>
		<p v-if="!readonly" class="mt-1 min-h-[24px] text-center text-sm font-semibold text-ink-2" aria-live="polite">{{ word }}</p>
	</div>
</template>
