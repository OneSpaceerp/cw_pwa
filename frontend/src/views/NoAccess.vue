<script setup>
import { ShieldAlert } from "@lucide/vue";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";

import { canUseApp, logout, refreshBoot, session } from "@/stores/session";
import { loadDeviceData } from "@/stores/sync";

const router = useRouter();
const checking = ref(false);

// Two different things an administrator has to fix, so say which one it is.
const reason = computed(() => {
	if (!session.boot?.has_access) {
		return "Your account has no Visits role. Ask your administrator for the CW Visit Engineer role.";
	}
	return "Your user is not linked to an active Employee record. Ask your administrator to set your user in the Employee's User ID field.";
});

async function retry() {
	checking.value = true;
	await refreshBoot();
	checking.value = false;
	if (canUseApp()) {
		await loadDeviceData();
		router.replace("/");
	}
}

async function signOut() {
	await logout();
	router.replace({ name: "login" });
}
</script>

<template>
	<div class="scroll-area h-full bg-surface">
		<div class="mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-6 py-10 text-center">
			<div class="flex h-16 w-16 items-center justify-center rounded-full tone-warn">
				<ShieldAlert :size="30" aria-hidden="true" />
			</div>
			<h1 class="mt-5 text-2xl font-extrabold text-ink">This account cannot use Visits yet</h1>
			<p class="mt-3 text-ink-2">{{ reason }}</p>
			<p class="mt-3 text-sm text-ink-3">Signed in as {{ session.boot?.user }}</p>

			<div class="mt-8 flex w-full flex-col gap-3">
				<button type="button" class="btn-primary btn-block" :disabled="checking" @click="retry">
					{{ checking ? "Checking" : "Check again" }}
				</button>
				<button type="button" class="btn-secondary btn-block" @click="signOut">Sign out</button>
			</div>
		</div>
	</div>
</template>
