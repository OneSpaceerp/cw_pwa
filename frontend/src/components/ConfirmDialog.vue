<script setup>
import { ui } from "@/stores/ui";
</script>

<template>
	<Teleport to="body">
		<Transition name="sheet">
			<div v-if="ui.confirm" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
				<div class="absolute inset-0 bg-black/50" aria-hidden="true" @click="ui.confirm.resolve(false)"></div>
				<section
					class="sheet-panel relative w-full max-w-md rounded-t-[24px] bg-surface p-5 pb-[calc(theme(spacing.safe-bottom)+20px)] sm:rounded-[24px]"
					role="alertdialog"
					aria-modal="true"
					:aria-label="ui.confirm.title"
				>
					<h2 class="text-lg font-bold text-ink">{{ ui.confirm.title }}</h2>
					<p v-if="ui.confirm.message" class="mt-2 whitespace-pre-line text-ink-2">{{ ui.confirm.message }}</p>
					<div class="mt-5 flex gap-3">
						<button type="button" class="btn-secondary flex-1" @click="ui.confirm.resolve(false)">
							{{ ui.confirm.cancelLabel }}
						</button>
						<button
							type="button"
							class="flex-1"
							:class="ui.confirm.danger ? 'btn-danger' : 'btn-primary'"
							@click="ui.confirm.resolve(true)"
						>
							{{ ui.confirm.confirmLabel }}
						</button>
					</div>
				</section>
			</div>
		</Transition>
	</Teleport>
</template>
