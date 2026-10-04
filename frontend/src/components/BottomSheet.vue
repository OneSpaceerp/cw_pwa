<script setup>
import { X } from "@lucide/vue";
import { onBeforeUnmount, watch } from "vue";

import { registerOverlay } from "@/stores/ui";

const props = defineProps({
	open: { type: Boolean, default: false },
	title: { type: String, default: "" },
	/** When false the sheet can only be closed through its own buttons. */
	dismissible: { type: Boolean, default: true },
});
const emit = defineEmits(["close"]);

const close = () => props.dismissible && emit("close");
const onKey = (event) => event.key === "Escape" && close();

// While open, the sheet is the first thing the system Back button closes (see stores/ui.js).
let unregister = null;
function release() {
	unregister?.();
	unregister = null;
	window.removeEventListener("keydown", onKey);
}

watch(
	() => props.open,
	(open) => {
		release();
		if (open) {
			unregister = registerOverlay(() => emit("close"));
			window.addEventListener("keydown", onKey);
		}
	}
);

onBeforeUnmount(release);
</script>

<template>
	<Teleport to="body">
		<Transition name="sheet">
			<div v-if="open" class="fixed inset-0 z-40 flex items-end justify-center">
				<div class="absolute inset-0 bg-black/50" aria-hidden="true" @click="close"></div>
				<section
					class="sheet-panel relative flex max-h-[88%] w-full max-w-xl flex-col rounded-t-[24px] bg-surface"
					role="dialog"
					aria-modal="true"
					:aria-label="title"
					:style="{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--keyboard-inset, 0px))' }"
				>
					<div class="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line" aria-hidden="true"></div>
					<header class="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-3">
						<h2 class="text-lg font-bold text-ink">{{ title }}</h2>
						<button v-if="dismissible" type="button" class="icon-btn -me-2" aria-label="Close" @click="close">
							<X :size="22" aria-hidden="true" />
						</button>
					</header>
					<div class="scroll-area min-h-0 flex-1 px-5 pb-5">
						<slot />
					</div>
					<footer v-if="$slots.footer" class="shrink-0 border-t border-line px-5 py-3">
						<slot name="footer" />
					</footer>
				</section>
			</div>
		</Transition>
	</Teleport>
</template>
