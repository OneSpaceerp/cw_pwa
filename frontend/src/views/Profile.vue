<script setup>
import { BellRing, ChevronRight, CloudUpload, Download, Globe, LogOut, RefreshCw, SquarePlus } from "@lucide/vue";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import BottomSheet from "@/components/BottomSheet.vue";
import PageHeader from "@/components/PageHeader.vue";
import PermissionsList from "@/components/PermissionsList.vue";
import * as db from "@/lib/db";
import { ago, initials } from "@/lib/format";
import { i18n, LANGUAGES, setLanguage, t } from "@/lib/i18n";
import { permissions, sendTestNotification } from "@/lib/permissions";
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
const testing = ref(false);
const version = __APP_VERSION__;

const unsynced = computed(() => waitingCount() + failedCount());
const megabytes = (bytes) => (bytes / 1024 / 1024).toFixed(1);

async function install() {
	// iOS has no install prompt; the engineer has to use Safari's Share menu.
	if (pwa.isIos && !pwa.canInstall) {
		iosHelp.value = true;
		return;
	}
	if (await promptInstall()) toast(t("App installed."), "ok");
}

async function refreshCatalogue() {
	refreshing.value = true;
	await loadMasters({ force: true });
	refreshing.value = false;
	toast(
		masters.error ? t("The lists could not be updated. Check your connection.") : t("Lists updated."),
		masters.error ? "bad" : "ok"
	);
}

async function testNotification() {
	testing.value = true;
	try {
		const result = await sendTestNotification();
		toast(
			result.sent
				? t("Test sent. It should appear in a few seconds.")
				: t("This phone is not registered for notifications yet. Allow notifications above first."),
			result.sent ? "ok" : "warn",
			5000
		);
	} catch (error) {
		toast(error.network ? t("Sending a test needs a connection.") : error.message, "bad");
	} finally {
		testing.value = false;
	}
}

async function signOut() {
	const ok = await confirm({
		title: t("Sign out?"),
		message: unsynced.value
			? t("{count} change(s) have not reached the server yet. Signing out deletes them from this phone.", { count: unsynced.value })
			: t("Visits saved on this phone will be removed. They stay on the server."),
		confirmLabel: unsynced.value ? t("Sign out and lose changes") : t("Sign out"),
		cancelLabel: t("Cancel"),
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
			<div class="mx-auto max-w-xl space-y-5 px-4 pb-24 pt-4">
				<section class="card flex items-center gap-4 p-5">
					<span class="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xl font-extrabold text-brand-strong" aria-hidden="true">
						{{ initials(session.boot?.full_name) }}
					</span>
					<div class="min-w-0">
						<h2 class="truncate text-xl font-extrabold text-ink">{{ session.boot?.full_name }}</h2>
						<p class="ltr truncate text-sm text-ink-2">{{ session.boot?.user }}</p>
						<p class="truncate text-sm text-ink-3">{{ t("Employee") }} <span class="ltr">{{ session.boot?.employee }}</span></p>
					</div>
				</section>

				<section>
					<h2 class="section-title">Language</h2>
					<div class="card flex items-center gap-3.5 p-4">
						<span class="icon-tile" aria-hidden="true"><Globe :size="22" /></span>
						<div class="flex flex-1 gap-2" role="radiogroup" :aria-label="t('Language')">
							<button
								v-for="item in LANGUAGES"
								:key="item.code"
								type="button"
								role="radio"
								:aria-checked="i18n.lang === item.code"
								class="min-h-[46px] flex-1 rounded-full border-[1.5px] text-sm font-bold"
								:class="i18n.lang === item.code ? 'border-brand-strong bg-brand-strong text-on-brand' : 'border-line bg-surface text-ink-2'"
								@click="setLanguage(item.code)"
							>
								{{ item.label }}
							</button>
						</div>
					</div>
				</section>

				<section>
					<h2 class="section-title">Permissions</h2>
					<div class="card px-4 py-1">
						<PermissionsList />
					</div>
					<button
						v-if="permissions.notifications === 'granted'"
						type="button"
						class="btn-quiet btn-block mt-3"
						:disabled="testing"
						@click="testNotification"
					>
						<BellRing :size="18" aria-hidden="true" />
						{{ testing ? t("Sending") : t("Send a test notification") }}
					</button>
				</section>

				<section>
					<h2 class="section-title">Sync</h2>
					<RouterLink :to="{ name: 'sync' }" class="card link-row">
						<span class="icon-tile" :class="unsynced ? 'tone-warn' : ''" aria-hidden="true"><CloudUpload :size="22" /></span>
						<span class="flex-1 font-bold text-ink">
							{{ unsynced ? t("{count} change(s) waiting to sync", { count: unsynced }) : t("Everything is synced") }}
						</span>
						<ChevronRight :size="20" class="text-brand-strong" aria-hidden="true" />
					</RouterLink>
					<p v-if="!persistent" class="mt-2 rounded-control px-4 py-3 text-sm font-semibold tone-warn">
						This browser is not keeping data between sessions (private mode?). Offline work will be lost if the app is closed.
					</p>
				</section>

				<section>
					<h2 class="section-title">This app</h2>
					<div class="card divide-y divide-line overflow-hidden">
						<button v-if="pwa.updateReady" type="button" class="link-row" @click="applyUpdate">
							<span class="icon-tile" aria-hidden="true"><Download :size="22" /></span>
							<span class="flex-1 font-bold text-brand-strong">Update to the new version</span>
						</button>
						<button v-if="!pwa.installed && (pwa.canInstall || pwa.isIos)" type="button" class="link-row" @click="install">
							<span class="icon-tile" aria-hidden="true"><SquarePlus :size="22" /></span>
							<span class="flex-1">
								<span class="block font-bold text-ink">Install on this phone</span>
								<span class="block text-sm text-ink-2">Opens full screen, keeps offline data longer, and allows notifications on iPhone.</span>
							</span>
						</button>
						<button type="button" class="link-row" :disabled="refreshing" @click="refreshCatalogue">
							<span class="icon-tile" aria-hidden="true"><RefreshCw :size="22" :class="refreshing ? 'spin' : ''" /></span>
							<span class="flex-1">
								<span class="block font-bold text-ink">Update lists</span>
								<span class="block text-sm text-ink-2">
									{{ t("Parameters, service types and categories") }}<template v-if="masters.loadedAt"> · {{ ago(masters.loadedAt) }}</template>
								</span>
							</span>
						</button>
					</div>
					<p class="mt-2 px-1 text-xs text-ink-3">
						{{ t("Version {version}", { version }) }}<template v-if="storage.usage"> · {{ t("{size} MB stored on this phone", { size: megabytes(storage.usage) }) }}</template>
					</p>
				</section>

				<button type="button" class="btn-secondary btn-block text-bad" @click="signOut">
					<LogOut :size="18" aria-hidden="true" />
					Sign out
				</button>
			</div>
		</div>

		<BottomSheet :open="iosHelp" :title="t('Install on iPhone')" @close="iosHelp = false">
			<ol class="space-y-4 py-2 text-ink">
				<li class="flex items-start gap-3">
					<span class="numeric flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold tone-brand">1</span>
					<span>
						{{ t("Open this page in Safari and tap the Share button") }}
						<svg class="-mt-1 inline h-5 w-5 text-info" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" :aria-label="t('Share icon')">
							<path d="M12 3v12" /><path d="m8 7 4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
						</svg>
					</span>
				</li>
				<li class="flex items-start gap-3">
					<span class="numeric flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold tone-brand">2</span>
					<span>Scroll down and choose Add to Home Screen.</span>
				</li>
				<li class="flex items-start gap-3">
					<span class="numeric flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold tone-brand">3</span>
					<span>Tap Add, then open CW Visits from your home screen.</span>
				</li>
			</ol>
		</BottomSheet>
	</div>
</template>
