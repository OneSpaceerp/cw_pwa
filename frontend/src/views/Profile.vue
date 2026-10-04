<script setup>
import { ChevronRight, CloudUpload, Download, LogOut, RefreshCw, SquarePlus } from "@lucide/vue";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import BottomSheet from "@/components/BottomSheet.vue";
import PageHeader from "@/components/PageHeader.vue";
import * as db from "@/lib/db";
import { ago, initials } from "@/lib/format";
import { applyUpdate, promptInstall, pwa, storageEstimate } from "@/lib/pwa";
import { loadMasters, masters } from "@/stores/masters";
import { failedCount, waitingCount } from "@/stores/outbox";
import { logout, session } from "@/stores/session";
import { confirm, toast } from "@/stores/ui";

const router = useRouter();
const iosHelp = ref(false);
const storage = ref({ usage: 0, quota: 0 });
const persistent = ref(true);
const refreshing = ref(false);
const version = __APP_VERSION__;

const unsynced = computed(() => waitingCount() + failedCount());
const megabytes = (bytes) => (bytes / 1024 / 1024).toFixed(1);

async function install() {
	// iOS has no install prompt; the engineer has to use Safari's Share menu.
	if (pwa.isIos && !pwa.canInstall) {
		iosHelp.value = true;
		return;
	}
	if (await promptInstall()) toast("App installed.", "ok");
}

async function refreshCatalogue() {
	refreshing.value = true;
	await loadMasters({ force: true });
	refreshing.value = false;
	toast(masters.error ? "The lists could not be updated. Check your connection." : "Lists updated.", masters.error ? "bad" : "ok");
}

async function signOut() {
	const ok = await confirm({
		title: "Sign out?",
		message: unsynced.value
			? `${unsynced.value} change(s) have not reached the server yet. Signing out deletes them from this phone.`
			: "Visits saved on this phone will be removed. They stay on the server.",
		confirmLabel: unsynced.value ? "Sign out and lose changes" : "Sign out",
		danger: Boolean(unsynced.value),
	});
	if (!ok) return;
	await logout();
	router.replace({ name: "login" });
}

onMounted(async () => {
	storage.value = await storageEstimate();
	persistent.value = await db.isPersistent();
});
</script>

<template>
	<div class="flex h-full flex-col">
		<PageHeader title="Profile" />

		<div class="scroll-area min-h-0 flex-1">
			<div class="mx-auto max-w-xl space-y-5 px-4 pb-28 pt-4">
				<section class="card flex items-center gap-4 p-5">
					<span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-strong text-lg font-extrabold text-on-brand" aria-hidden="true">
						{{ initials(session.boot?.full_name) }}
					</span>
					<div class="min-w-0">
						<h2 class="truncate text-lg font-extrabold text-ink">{{ session.boot?.full_name }}</h2>
						<p class="truncate text-sm text-ink-2">{{ session.boot?.user }}</p>
						<p class="truncate text-sm text-ink-3">Employee {{ session.boot?.employee }}</p>
					</div>
				</section>

				<section>
					<h2 class="section-title">Sync</h2>
					<RouterLink :to="{ name: 'sync' }" class="card flex min-h-[60px] items-center gap-3 px-4 py-3 active:bg-sunken">
						<CloudUpload :size="20" class="shrink-0 text-ink-3" aria-hidden="true" />
						<span class="flex-1 font-semibold text-ink">
							{{ unsynced ? `${unsynced} change${unsynced === 1 ? "" : "s"} waiting to sync` : "Everything is synced" }}
						</span>
						<ChevronRight :size="18" class="text-ink-3" aria-hidden="true" />
					</RouterLink>
					<p v-if="!persistent" class="mt-2 rounded-control px-4 py-3 text-sm font-semibold tone-warn">
						This browser is not keeping data between sessions (private mode?). Offline work will be lost if the app is closed.
					</p>
				</section>

				<section>
					<h2 class="section-title">This app</h2>
					<div class="card divide-y divide-line">
						<button v-if="pwa.updateReady" type="button" class="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left active:bg-sunken" @click="applyUpdate">
							<Download :size="20" class="shrink-0 text-brand-strong" aria-hidden="true" />
							<span class="flex-1 font-semibold text-brand-strong">Update to the new version</span>
						</button>
						<button v-if="!pwa.installed && (pwa.canInstall || pwa.isIos)" type="button" class="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left active:bg-sunken" @click="install">
							<SquarePlus :size="20" class="shrink-0 text-ink-3" aria-hidden="true" />
							<span class="flex-1">
								<span class="block font-semibold text-ink">Install on this phone</span>
								<span class="block text-sm text-ink-2">Opens full screen and keeps offline data longer.</span>
							</span>
						</button>
						<button type="button" class="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left active:bg-sunken" :disabled="refreshing" @click="refreshCatalogue">
							<RefreshCw :size="20" class="shrink-0 text-ink-3" :class="refreshing ? 'spin' : ''" aria-hidden="true" />
							<span class="flex-1">
								<span class="block font-semibold text-ink">Update lists</span>
								<span class="block text-sm text-ink-2">
									Parameters, service types and categories{{ masters.loadedAt ? `, updated ${ago(masters.loadedAt)}` : "" }}
								</span>
							</span>
						</button>
					</div>
					<p class="mt-2 px-1 text-xs text-ink-3">
						Version {{ version }}<template v-if="storage.usage"> · {{ megabytes(storage.usage) }} MB stored on this phone</template>
					</p>
				</section>

				<button type="button" class="btn-secondary btn-block text-bad" @click="signOut">
					<LogOut :size="18" aria-hidden="true" />
					Sign out
				</button>
			</div>
		</div>

		<BottomSheet :open="iosHelp" title="Install on iPhone" @close="iosHelp = false">
			<ol class="space-y-4 py-2 text-ink">
				<li class="flex items-start gap-3">
					<span class="numeric flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold tone-brand">1</span>
					<span>
						Open this page in <strong>Safari</strong> and tap the Share button
						<svg class="-mt-1 inline h-5 w-5 text-info" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Share icon">
							<path d="M12 3v12" /><path d="m8 7 4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
						</svg>
						at the bottom of the screen.
					</span>
				</li>
				<li class="flex items-start gap-3">
					<span class="numeric flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold tone-brand">2</span>
					<span>Scroll down and choose <strong>Add to Home Screen</strong>.</span>
				</li>
				<li class="flex items-start gap-3">
					<span class="numeric flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold tone-brand">3</span>
					<span>Tap <strong>Add</strong>, then open CW Visits from your home screen.</span>
				</li>
			</ol>
		</BottomSheet>
	</div>
</template>
