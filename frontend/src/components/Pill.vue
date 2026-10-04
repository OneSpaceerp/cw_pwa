<script setup>
defineProps({
	/** ok | warn | bad | info | review | brand | muted */
	tone: { type: String, default: "muted" },
	/** A leading dot, for statuses. Colour is never the only signal: the label says it too. */
	dot: { type: Boolean, default: false },
});
</script>

<template>
	<span
		class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold leading-none"
		:class="`tone-${tone}`"
	>
		<span v-if="dot" class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true"></span>
		<slot />
	</span>
</template>
