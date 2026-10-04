<script setup>
import { CircleAlert, CloudUpload, LoaderCircle } from "@lucide/vue";
import { computed } from "vue";

import { failedCount, outbox, waitingCount } from "@/stores/outbox";

const waiting = computed(() => waitingCount());
const failed = computed(() => failedCount());
</script>

<template>
	<!-- Only appears when something has not reached the server. -->
	<RouterLink
		v-if="waiting || failed"
		:to="{ name: 'sync' }"
		class="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-bold"
		:class="failed ? 'tone-bad' : 'tone-warn'"
		:aria-label="failed ? `${failed} changes need attention` : `${waiting} changes waiting to sync`"
	>
		<CircleAlert v-if="failed" :size="15" aria-hidden="true" />
		<LoaderCircle v-else-if="outbox.flushing" :size="15" class="spin" aria-hidden="true" />
		<CloudUpload v-else :size="15" aria-hidden="true" />
		<span class="numeric">{{ failed || waiting }}</span>
		<span>{{ failed ? "to fix" : "to sync" }}</span>
	</RouterLink>
</template>
