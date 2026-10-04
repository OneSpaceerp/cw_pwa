<script setup>
defineProps({
	icon: { type: [Object, Function], default: null },
	title: { type: String, required: true },
	text: { type: String, default: "" },
});
</script>

<template>
	<div class="flex flex-col items-center px-8 py-12 text-center">
		<div v-if="icon" class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
			<component :is="icon" :size="30" aria-hidden="true" />
		</div>
		<h2 class="text-lg font-bold text-ink">{{ title }}</h2>
		<p v-if="text" class="mt-1.5 max-w-xs text-ink-2">{{ text }}</p>
		<div v-if="$slots.default" class="mt-5">
			<slot />
		</div>
	</div>
</template>
