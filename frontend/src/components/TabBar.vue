<script setup>
import { Bell, House, MapPinCheck, User } from "@lucide/vue";
import { computed } from "vue";
import { useRoute } from "vue-router";

import { alerts } from "@/stores/alerts";

const route = useRoute();

const tabs = computed(() => [
	{ name: "home", label: "Home", icon: House },
	{ name: "visits", label: "Visits", icon: MapPinCheck },
	{ name: "alerts", label: "Alerts", icon: Bell, badge: alerts.unread },
	{ name: "profile", label: "Profile", icon: User },
]);
</script>

<template>
	<!-- Hidden while typing: it would only take space away from the field being filled. -->
	<nav
		class="tabbar z-20 shrink-0 bg-surface pb-safe-bottom shadow-bar"
		aria-label="Main"
	>
		<ul class="mx-auto flex h-[var(--tabbar-height)] max-w-xl items-stretch">
			<li v-for="tab in tabs" :key="tab.name" class="flex-1">
				<RouterLink
					:to="{ name: tab.name }"
					class="relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors"
					:class="route.meta.tab === tab.name ? 'text-brand-strong' : 'text-ink-3'"
					:aria-current="route.meta.tab === tab.name ? 'page' : undefined"
				>
					<span
						class="relative flex h-8 w-14 items-center justify-center rounded-full transition-colors"
						:class="route.meta.tab === tab.name ? 'bg-brand-soft' : ''"
					>
						<component :is="tab.icon" :size="22" :stroke-width="route.meta.tab === tab.name ? 2.4 : 2" aria-hidden="true" />
						<span
							v-if="tab.badge"
							class="absolute right-1.5 top-0 min-w-[18px] rounded-full bg-bad px-1 text-center text-[10px] font-bold leading-[18px] text-white"
						>
							{{ tab.badge > 9 ? "9+" : tab.badge }}
							<span class="sr-only">unread</span>
						</span>
					</span>
					{{ tab.label }}
				</RouterLink>
			</li>
		</ul>
	</nav>
</template>

<style scoped>
:global(.keyboard-open) .tabbar {
	display: none;
}
</style>
