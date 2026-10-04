<script setup>
import { ChevronLeft } from "@lucide/vue";
import { useRouter } from "vue-router";

import { pwa } from "@/lib/pwa";
import { session } from "@/stores/session";

const props = defineProps({
	title: { type: String, default: "" },
	subtitle: { type: String, default: "" },
	/** Show a back button. `fallback` is where it goes when there is no history (a deep link). */
	back: { type: Boolean, default: false },
	fallback: { type: [String, Object], default: "/" },
});

const router = useRouter();

function goBack() {
	if (window.history.state?.back) router.back();
	else router.replace(props.fallback);
}
</script>

<template>
	<!-- A banner above (offline, update ready) already covers the status-bar inset. -->
	<header
		class="z-10 shrink-0 border-b border-line bg-surface"
		:class="session.online && !pwa.updateReady ? 'pt-safe-top' : ''"
	>
		<div class="mx-auto flex h-[var(--header-height)] max-w-xl items-center gap-1 px-2">
			<button v-if="back" type="button" class="icon-btn" aria-label="Back" @click="goBack">
				<ChevronLeft :size="26" aria-hidden="true" />
			</button>
			<div class="min-w-0 flex-1" :class="back ? '' : 'ps-3'">
				<h1 class="truncate text-[19px] font-bold text-ink">
					<slot name="title">{{ title }}</slot>
				</h1>
				<p v-if="subtitle" class="-mt-0.5 truncate text-xs font-medium text-ink-3">{{ subtitle }}</p>
			</div>
			<div class="flex shrink-0 items-center gap-1 pe-1">
				<slot name="actions" />
			</div>
		</div>
		<slot name="below" />
	</header>
</template>
