<script setup>
import { Eye, EyeOff, Globe, LoaderCircle, Lock, User } from "@lucide/vue";
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { i18n, LANGUAGES, setLanguage, t } from "@/lib/i18n";
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

const otherLanguage = () => LANGUAGES.find((item) => item.code !== i18n.lang);

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
			? t("Cannot reach the server. Check your connection and try again.")
			: cause.status === 401
				? t("The email or password is not correct.")
				: cause.message || t("Sign-in failed.");
	} finally {
		busy.value = false;
	}
}
</script>

<template>
	<div class="scroll-area h-full bg-surface">
		<div class="mx-auto flex min-h-full max-w-md flex-col px-6 pb-[calc(theme(spacing.safe-bottom)+24px)] pt-[calc(theme(spacing.safe-top)+20px)]">
			<div class="flex justify-end">
				<button
					type="button"
					class="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-sm font-bold text-brand-strong active:bg-brand-soft"
					@click="setLanguage(otherLanguage().code)"
				>
					<Globe :size="18" aria-hidden="true" />
					{{ otherLanguage().label }}
				</button>
			</div>

			<div class="mt-6 flex flex-col items-center text-center">
				<img :src="icon" alt="" width="88" height="88" class="h-[88px] w-[88px] rounded-[26px] shadow-card" />
				<p class="ltr mt-4 text-sm font-extrabold tracking-[0.2em] text-brand-strong">C-WATER</p>
				<h1 class="mt-5 text-[28px] font-extrabold leading-tight text-ink">Let's sign you in</h1>
				<p class="mt-1.5 text-ink-2">Use your ERPNext account to see your visits.</p>
			</div>

			<form class="mt-8 space-y-4" novalidate @submit.prevent="submit">
				<div>
					<label class="sr-only" for="login-user">Email or username</label>
					<div class="relative">
						<User :size="20" class="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden="true" />
						<input
							id="login-user"
							v-model="username"
							class="field min-h-[58px] ps-12"
							type="text"
							inputmode="email"
							placeholder="Email or username"
							autocomplete="username"
							autocapitalize="none"
							autocorrect="off"
							spellcheck="false"
							required
						/>
					</div>
				</div>

				<div>
					<label class="sr-only" for="login-password">Password</label>
					<div class="relative">
						<Lock :size="20" class="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden="true" />
						<input
							id="login-password"
							v-model="password"
							class="field min-h-[58px] pe-14 ps-12"
							:type="showPassword ? 'text' : 'password'"
							placeholder="Password"
							autocomplete="current-password"
							required
						/>
						<button
							type="button"
							class="icon-btn absolute end-1.5 top-1/2 -translate-y-1/2"
							:aria-label="showPassword ? t('Hide password') : t('Show password')"
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

				<button type="submit" class="btn-primary btn-block min-h-[58px] text-lg" :disabled="busy || !username || !password">
					<LoaderCircle v-if="busy" :size="20" class="spin" aria-hidden="true" />
					{{ busy ? t("Signing in") : t("Sign in") }}
				</button>
			</form>

			<p class="mt-auto pt-10 text-center text-xs text-ink-3">C-Water Water Treatment</p>
		</div>
	</div>
</template>
