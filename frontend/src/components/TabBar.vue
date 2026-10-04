<script setup>
import { Bell, House, MapPinCheck, Plus, User } from "@lucide/vue";
import { computed } from "vue";
import { useRoute } from "vue-router";

import { t } from "@/lib/i18n";
import { alerts } from "@/stores/alerts";
import { settings } from "@/stores/session";

const route = useRoute();

const canCreate = computed(() => Boolean(settings().allow_engineer_created_visits));

// Two tabs each side of the raised "new visit" button.
const left = computed(() => [
	{ name: "home", label: t("Home"), icon: House },
	{ name: "visits", label: t("Visits"), icon: MapPinCheck },
]);
const right = computed(() => [
	{ name: "alerts", label: t("Alerts"), icon: Bell, badge: alerts.unread },
	{ name: "profile", label: t("Profile"), icon: User },
]);
</script>

<template>
	<nav class="tabbar relative z-20 shrink-0 rounded-t-[28px] bg-surface pb-safe-bottom shadow-bar" aria-label="Main">
		<div class="mx-auto flex h-[var(--tabbar-height)] max-w-xl items-stretch">
			<template v-for="(group, side) in [left, right]" :key="side">
				<RouterLink
					v-for="tab in group"
					:key="tab.name"
					:to="{ name: tab.name }"
					class="relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors"
					:class="route.meta.tab === tab.name ? 'text-brand-strong' : 'text-ink-3'"
					:aria-current="route.meta.tab === tab.name ? 'page' : undefined"
				>
					<span class="relative">
						<component
							:is="tab.icon"
							:size="24"
							:stroke-width="route.meta.tab === tab.name ? 2.4 : 1.9"
							:fill="route.meta.tab === tab.name ? 'var(--brand-soft)' : 'none'"
							aria-hidden="true"
						/>
						<span
							v-if="tab.badge"
							class="numeric absolute -end-2.5 -top-1.5 min-w-[18px] rounded-full bg-bad px-1 text-center text-[10px] font-bold leading-[18px] text-white"
						>
							{{ tab.badge > 9 ? "9+" : tab.badge }}
							<span class="sr-only">unread</span>
						</span>
					</span>
					{{ tab.label }}
				</RouterLink>

				<!-- The centre slot, between the two groups. -->
				<div v-if="side === 0 && canCreate" class="relative w-[76px] shrink-0">
					<RouterLink
						:to="{ name: 'visit-new' }"
						class="absolute inset-x-0 -top-7 mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-strong text-on-brand shadow-fab ring-[6px] ring-bg transition-transform active:scale-95"
						aria-label="New visit"
					>
						<Plus :size="30" :stroke-width="2.4" aria-hidden="true" />
					</RouterLink>
				</div>
			</template>
		</div>
	</nav>
</template>
