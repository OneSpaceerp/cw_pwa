<script setup>
import { Eye, EyeOff, LoaderCircle } from "@lucide/vue";
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { canUseApp, login, session } from "@/stores/session";
import { loadDeviceData } from "@/stores/sync";

const route = useRoute();
const router = useRouter();

const username = ref("");
const password = ref("");
const showPassword = ref(false);
const busy = ref(false);
const error = ref("");
const icon = `${__ICONS__}/icon-192.png`;

async function submit() {
	if (busy.value) return;
	error.value = "";
	busy.value = true;
	try {
		await login(username.value.trim(), password.value);
		if (canUseApp()) await loadDeviceData();
		const next = typeof route.query.next === "string" && route.query.next.startsWith("/") ? route.query.next : "/";
		router.replace(next);
	} catch (cause) {
		error.value = cause.network
			? "Cannot reach the server. Check your connection and try again."
			: cause.status === 401
				? "The email or password is not correct."
				: cause.message || "Sign-in failed.";
	} finally {
		busy.value = false;
	}
}
</script>

<template>
	<div class="scroll-area h-full bg-surface">
		<div class="mx-auto flex min-h-full max-w-md flex-col px-6 pb-[calc(theme(spacing.safe-bottom)+24px)] pt-[calc(theme(spacing.safe-top)+48px)]">
			<div class="flex items-center gap-3">
				<img :src="icon" alt="" width="56" height="56" class="h-14 w-14 rounded-2xl" />
				<div>
					<p class="text-sm font-bold uppercase tracking-wider text-brand-strong">C-Water</p>
					<h1 class="text-2xl font-extrabold text-ink">Visits</h1>
				</div>
			</div>

			<p class="mt-8 text-lg text-ink-2">Sign in with your ERPNext account to see your visits.</p>

			<form class="mt-6 space-y-4" novalidate @submit.prevent="submit">
				<div>
					<label class="field-label" for="login-user">Email or username</label>
					<input
						id="login-user"
						v-model="username"
						class="field"
						type="text"
						inputmode="email"
						autocomplete="username"
						autocapitalize="none"
						autocorrect="off"
						spellcheck="false"
						required
					/>
				</div>

				<div>
					<label class="field-label" for="login-password">Password</label>
					<div class="relative">
						<input
							id="login-password"
							v-model="password"
							class="field pr-14"
							:type="showPassword ? 'text' : 'password'"
							autocomplete="current-password"
							required
						/>
						<button
							type="button"
							class="icon-btn absolute right-1 top-1/2 -translate-y-1/2"
							:aria-label="showPassword ? 'Hide password' : 'Show password'"
							:aria-pressed="showPassword"
							@click="showPassword = !showPassword"
						>
							<component :is="showPassword ? EyeOff : Eye" :size="20" aria-hidden="true" />
						</button>
					</div>
				</div>

				<p v-if="error" class="rounded-control px-4 py-3 text-sm font-semibold tone-bad" role="alert">{{ error }}</p>
				<p v-else-if="!session.online" class="rounded-control px-4 py-3 text-sm font-semibold tone-warn">
					You are offline. Signing in needs a connection.
				</p>

				<button type="submit" class="btn-primary btn-block" :disabled="busy || !username || !password">
					<LoaderCircle v-if="busy" :size="20" class="spin" aria-hidden="true" />
					{{ busy ? "Signing in" : "Sign in" }}
				</button>
			</form>

			<p class="mt-auto pt-10 text-center text-xs text-ink-3">C-Water Water Treatment</p>
		</div>
	</div>
</template>
