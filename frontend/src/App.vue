<script setup>
import { onBeforeUnmount, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";

import ConfirmDialog from "./components/ConfirmDialog.vue";
import StatusBanners from "./components/StatusBanners.vue";
import TabBar from "./components/TabBar.vue";
import Toasts from "./components/Toasts.vue";

const route = useRoute();
const router = useRouter();

// The session ended on the server (expired, or signed out elsewhere).
const onSignedOut = () => router.replace({ name: "login", query: { next: route.fullPath } });

// A visit created offline received its real id: keep the open screen pointing at it.
const onRenamed = ({ detail }) => {
	if (route.params.name === detail.from) {
		router.replace({ name: route.name, params: { ...route.params, name: detail.to } });
	}
};

onMounted(() => {
	window.addEventListener("cw:signed-out", onSignedOut);
	window.addEventListener("cw:visit-renamed", onRenamed);
});
onBeforeUnmount(() => {
	window.removeEventListener("cw:signed-out", onSignedOut);
	window.removeEventListener("cw:visit-renamed", onRenamed);
});
</script>

<template>
	<div class="flex h-full flex-col bg-bg pl-safe-left pr-safe-right">
		<StatusBanners v-if="!route.meta.bare" />

		<main class="relative min-h-0 flex-1">
			<RouterView v-slot="{ Component, route: current }">
				<Transition name="page" mode="out-in">
					<component :is="Component" :key="current.name === 'visit-run' ? current.name + current.params.name : current.fullPath" />
				</Transition>
			</RouterView>
		</main>

		<TabBar v-if="route.meta.tab" />
		<Toasts />
		<ConfirmDialog />
	</div>
</template>
