<script setup>
import { CircleAlert, CircleCheck, Info } from "@lucide/vue";

import { ui } from "@/stores/ui";

const ICONS = { ok: CircleCheck, bad: CircleAlert, warn: CircleAlert, info: Info };
</script>

<template>
	<div
		class="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-4 pt-[calc(theme(spacing.safe-top)+12px)]"
		role="status"
		aria-live="polite"
	>
		<TransitionGroup name="toast">
			<div
				v-for="item in ui.toasts"
				:key="item.id"
				class="pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-control border border-line bg-surface px-4 py-3 text-sm font-medium text-ink shadow-card"
			>
				<component
					:is="ICONS[item.tone] || Info"
					:size="18"
					class="mt-0.5 shrink-0"
					:class="{ 'text-ok': item.tone === 'ok', 'text-bad': item.tone === 'bad', 'text-warn': item.tone === 'warn', 'text-info': item.tone === 'info' }"
					aria-hidden="true"
				/>
				<span class="whitespace-pre-line">{{ item.message }}</span>
			</div>
		</TransitionGroup>
	</div>
</template>
