<script setup>
import { Eraser } from "@lucide/vue";
import { onBeforeUnmount, onMounted, ref } from "vue";

const emit = defineEmits(["update:modelValue"]);
defineProps({ modelValue: { type: String, default: "" } });

const canvas = ref(null);
const hasInk = ref(false);
let context = null;
let drawing = false;

function resize() {
	const element = canvas.value;
	if (!element) return;
	// Draw at device resolution so the stroke is sharp, then scale back to CSS pixels.
	const ratio = Math.min(window.devicePixelRatio || 1, 3);
	const { width, height } = element.getBoundingClientRect();
	element.width = Math.round(width * ratio);
	element.height = Math.round(height * ratio);
	context = element.getContext("2d");
	context.scale(ratio, ratio);
	context.lineWidth = 2.4;
	context.lineCap = "round";
	context.lineJoin = "round";
	// Always dark ink on a white pad: the image is printed on the service report.
	context.strokeStyle = "#0e2430";
	hasInk.value = false;
	emit("update:modelValue", "");
}

function point(event) {
	const rect = canvas.value.getBoundingClientRect();
	return [event.clientX - rect.left, event.clientY - rect.top];
}

function start(event) {
	drawing = true;
	canvas.value.setPointerCapture(event.pointerId);
	context.beginPath();
	context.moveTo(...point(event));
}

function move(event) {
	if (!drawing) return;
	context.lineTo(...point(event));
	context.stroke();
	hasInk.value = true;
}

function end() {
	if (!drawing) return;
	drawing = false;
	emit("update:modelValue", hasInk.value ? canvas.value.toDataURL("image/png") : "");
}

function clear() {
	const element = canvas.value;
	context.clearRect(0, 0, element.width, element.height);
	hasInk.value = false;
	emit("update:modelValue", "");
}

onMounted(() => {
	resize();
	window.addEventListener("orientationchange", resize);
});
onBeforeUnmount(() => window.removeEventListener("orientationchange", resize));
</script>

<template>
	<div>
		<div class="relative overflow-hidden rounded-control border border-line bg-white">
			<canvas
				ref="canvas"
				class="block h-40 w-full touch-none"
				role="img"
				aria-label="Signature area. Sign with your finger."
				@pointerdown.prevent="start"
				@pointermove.prevent="move"
				@pointerup="end"
				@pointercancel="end"
				@pointerleave="end"
			></canvas>
			<span
				v-if="!hasInk"
				class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-[#6b828d]"
			>
				Sign here
			</span>
		</div>
		<button v-if="hasInk" type="button" class="mt-2 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-ink-2" @click="clear">
			<Eraser :size="16" aria-hidden="true" />
			Clear signature
		</button>
	</div>
</template>
