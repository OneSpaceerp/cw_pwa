<script setup>
import { CircleAlert, CircleCheck, CloudUpload, LoaderCircle, RotateCw, Trash2 } from "@lucide/vue";
import { computed } from "vue";

import EmptyState from "@/components/EmptyState.vue";
import PageHeader from "@/components/PageHeader.vue";
import { ago } from "@/lib/format";
import { t } from "@/lib/i18n";
import { isLocalId, mine, outbox, retryOp } from "@/stores/outbox";
import { session } from "@/stores/session";
import { syncNow } from "@/stores/sync";
import { confirm } from "@/stores/ui";
import { discardOp, visits } from "@/stores/visits";

const ops = computed(() => mine());
const failed = computed(() => ops.value.filter((op) => op.status === "failed"));

function target(op) {
	const record = visits.records[op.visit];
	return record?.data.customer_name || (isLocalId(op.visit) ? t("New visit") : op.visit);
}

async function discard(op) {
	const isCreate = op.action === "create_visit";
	const ok = await confirm({
		title: isCreate ? t("Discard this visit?") : t("Discard this change?"),
		message: isCreate
			? t("The visit and everything recorded for it on this phone will be deleted. It was never sent to the server.")
			: t("This change will not be sent to the server."),
		confirmLabel: t("Discard"),
		cancelLabel: t("Cancel"),
		danger: true,
	});
	if (ok) await discardOp(op);
}
</script>

<template>
	<div class="flex h-full flex-col">
		<PageHeader back title="Waiting to sync" :subtitle="outbox.lastFlushAt ? t('Last attempt {when}', { when: ago(outbox.lastFlushAt) }) : ''" />

		<div class="scroll-area min-h-0 flex-1">
			<div class="mx-auto max-w-xl space-y-4 px-4 pb-8 pt-4">
				<EmptyState
					v-if="!ops.length"
					:icon="CircleCheck"
					title="Everything is synced"
					text="All your work has reached the server."
				/>

				<template v-else>
					<p v-if="!session.online" class="rounded-card px-4 py-3 font-semibold tone-warn">
						You are offline. These changes are safe on this phone and will be sent when you reconnect.
					</p>
					<p v-else-if="failed.length" class="rounded-card px-4 py-3 font-semibold tone-bad" role="alert">
						{{ t("{count} change(s) could not be sent. Retry, or discard to continue.", { count: failed.length }) }}
					</p>
					<p v-else-if="outbox.lastError" class="rounded-card px-4 py-3 font-semibold tone-warn">
						{{ t(outbox.lastError) }} {{ t("Trying again automatically.") }}
					</p>

					<button type="button" class="btn-primary btn-block" :disabled="outbox.flushing || !session.online" @click="syncNow">
						<LoaderCircle v-if="outbox.flushing" :size="20" class="spin" aria-hidden="true" />
						<RotateCw v-else :size="18" aria-hidden="true" />
						{{ outbox.flushing ? "Syncing" : "Sync now" }}
					</button>

					<ul class="card-outline divide-y divide-line">
						<li v-for="op in ops" :key="op.id" class="px-4 py-3">
							<div class="flex items-start gap-3">
								<span
									class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
									:class="op.status === 'failed' ? 'tone-bad' : 'tone-warn'"
									aria-hidden="true"
								>
									<CircleAlert v-if="op.status === 'failed'" :size="18" />
									<LoaderCircle v-else-if="op.status === 'sending'" :size="18" class="spin" />
									<CloudUpload v-else :size="18" />
								</span>
								<div class="min-w-0 flex-1">
									<p class="font-semibold text-ink">{{ op.label }}</p>
									<p class="truncate text-sm text-ink-2">{{ target(op) }} · {{ ago(op.createdAt) }}</p>
									<p v-if="op.error" class="mt-1 whitespace-pre-line text-sm font-medium" :class="op.status === 'failed' ? 'text-bad' : 'text-ink-3'">
										{{ op.error }}
									</p>
								</div>
							</div>
							<div v-if="op.status === 'failed'" class="mt-3 flex gap-3 ps-12">
								<button type="button" class="btn-secondary min-h-[44px] flex-1 text-sm" @click="retryOp(op.id)">
									<RotateCw :size="16" aria-hidden="true" />
									Retry
								</button>
								<button type="button" class="btn-secondary min-h-[44px] flex-1 text-sm text-bad" @click="discard(op)">
									<Trash2 :size="16" aria-hidden="true" />
									Discard
								</button>
							</div>
						</li>
					</ul>
				</template>
			</div>
		</div>
	</div>
</template>
