<script setup>
/** Location, camera and notifications: what each is for, its real state, and a button to allow it. */
import { Bell, Camera, Check, MapPin } from "@lucide/vue";
import { computed, onMounted, ref } from "vue";

import { t } from "@/lib/i18n";
import { permissions, refreshPermissions, requestCamera, requestLocation, requestNotifications } from "@/lib/permissions";
import { toast } from "@/stores/ui";

const busy = ref("");

const items = computed(() => [
	{
		id: "location",
		icon: MapPin,
		title: t("Location"),
		why: t("Records where you are when you start and finish a visit."),
		state: permissions.location,
		request: requestLocation,
	},
	{
		id: "camera",
		icon: Camera,
		title: t("Camera"),
		why: t("Takes photos of the site, equipment and receipts."),
		state: permissions.camera,
		request: requestCamera,
	},
	{
		id: "notifications",
		icon: Bell,
		title: t("Notifications"),
		why: permissions.notificationsNeedInstall
			? t("On iPhone, add the app to your Home Screen first. Notifications only work from there.")
			: t("Tells you about new visits, requests and review results."),
		state: permissions.notifications,
		blocked: permissions.notificationsNeedInstall,
		request: requestNotifications,
	},
]);

async function allow(item) {
	busy.value = item.id;
	const result = await item.request();
	busy.value = "";
	if (result === "denied") {
		toast(t("Blocked. Allow it for this app in your phone's settings."), "warn", 5000);
	}
}

onMounted(refreshPermissions);
</script>

<template>
	<ul class="divide-y divide-line">
		<li v-for="item in items" :key="item.id" class="flex items-center gap-3.5 py-3.5">
			<span class="icon-tile" aria-hidden="true">
				<component :is="item.icon" :size="22" />
			</span>
			<div class="min-w-0 flex-1">
				<p class="font-bold text-ink">{{ item.title }}</p>
				<p class="text-sm text-ink-2">{{ item.why }}</p>
				<p v-if="item.state === 'denied'" class="mt-1 text-sm font-semibold text-bad">
					Blocked. Allow it for this app in your phone's settings.
				</p>
				<p v-else-if="item.state === 'unsupported'" class="mt-1 text-sm font-semibold text-ink-3">
					Not available in this browser.
				</p>
			</div>

			<span v-if="item.state === 'granted'" class="chip tone-ok shrink-0">
				<Check :size="14" aria-hidden="true" />
				Allowed
			</span>
			<button
				v-else-if="item.state === 'prompt' && !item.blocked"
				type="button"
				class="btn-outline min-h-[44px] shrink-0 px-4 text-sm"
				:disabled="busy === item.id"
				@click="allow(item)"
			>
				{{ busy === item.id ? t("Asking") : t("Allow") }}
			</button>
		</li>
	</ul>
</template>
