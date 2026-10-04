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
		class="chip"
		:class="`tone-${tone}`"
	>
		<span v-if="dot" class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true"></span>
		<slot />
	</span>
</template>
