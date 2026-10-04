<script setup>
import { RefreshCw, WifiOff } from "@lucide/vue";

import { applyUpdate, pwa } from "@/lib/pwa";
import { session } from "@/stores/session";
</script>

<template>
	<!-- Persistent, not toasts: the engineer needs to know this while reading the screen. -->
	<div class="z-30 shrink-0" aria-live="polite">
		<div
			v-if="!session.online"
			class="flex items-center justify-center gap-2 bg-ink px-4 pb-1.5 pt-[calc(theme(spacing.safe-top)+6px)] text-sm font-semibold text-bg"
		>
			<WifiOff :size="16" aria-hidden="true" />
			Offline. Your work is saved on this phone and will sync later.
		</div>

		<div
			v-if="pwa.updateReady"
			class="flex items-center justify-between gap-3 bg-brand-strong px-4 py-2 text-sm font-semibold text-on-brand"
			:class="session.online ? 'pt-[calc(theme(spacing.safe-top)+8px)]' : ''"
		>
			<span>A new version is ready.</span>
			<button
				type="button"
				class="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-on-brand px-3.5 text-brand-strong"
				@click="applyUpdate"
			>
				<RefreshCw :size="15" aria-hidden="true" />
				Update
			</button>
		</div>
	</div>
</template>
