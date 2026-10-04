<script setup>
import { Bell, ChevronRight } from "@lucide/vue";
import { onBeforeUnmount, onMounted } from "vue";

import EmptyState from "@/components/EmptyState.vue";
import PageHeader from "@/components/PageHeader.vue";
import { ago } from "@/lib/format";
import { alerts, loadAlerts, markAllRead } from "@/stores/alerts";

// Subjects come from the server as HTML-capable text; show them as plain text only.
const plain = (html) => String(html || "").replace(/<[^>]+>/g, "");

onMounted(loadAlerts);
// Opening the screen is reading the alerts; mark them on the way out so the dots are seen first.
onBeforeUnmount(markAllRead);
</script>

<template>
	<div class="flex h-full flex-col">
		<PageHeader title="Alerts" :subtitle="alerts.loadedAt ? `Updated ${ago(alerts.loadedAt)}` : ''" />

		<div class="scroll-area min-h-0 flex-1">
			<div class="mx-auto max-w-xl px-4 pb-28 pt-4">
				<div v-if="alerts.loading && !alerts.loadedAt" class="space-y-3" aria-busy="true">
					<div v-for="n in 4" :key="n" class="skeleton h-16"></div>
				</div>

				<ul v-else-if="alerts.items.length" class="card divide-y divide-line">
					<li v-for="item in alerts.items" :key="item.name">
						<component
							:is="item.document_type === 'CW Site Visit' ? 'RouterLink' : 'div'"
							:to="item.document_type === 'CW Site Visit' ? { name: 'visit', params: { name: item.document_name } } : undefined"
							class="flex min-h-[64px] items-center gap-3 px-4 py-3"
							:class="item.document_type === 'CW Site Visit' ? 'active:bg-sunken' : ''"
						>
							<span class="h-2.5 w-2.5 shrink-0 rounded-full" :class="item.read ? 'bg-transparent' : 'bg-brand'" aria-hidden="true"></span>
							<div class="min-w-0 flex-1">
								<p class="text-ink" :class="item.read ? 'font-medium' : 'font-bold'">
									<span v-if="!item.read" class="sr-only">Unread: </span>{{ plain(item.subject) }}
								</p>
								<p class="text-sm text-ink-3">{{ ago(item.creation) }}</p>
							</div>
							<ChevronRight v-if="item.document_type === 'CW Site Visit'" :size="18" class="shrink-0 text-ink-3" aria-hidden="true" />
						</component>
					</li>
				</ul>

				<EmptyState
					v-else
					:icon="Bell"
					title="No alerts"
					text="You will be told here when a visit is assigned, sent back or approved."
				/>

				<p v-if="alerts.error" class="mt-4 rounded-control px-4 py-3 text-sm font-semibold tone-bad" role="alert">{{ alerts.error }}</p>
			</div>
		</div>
	</div>
</template>
