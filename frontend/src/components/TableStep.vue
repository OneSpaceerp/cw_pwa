<script setup>
/** A list of rows (findings, operations, expenses, ...) with add / edit / delete in a sheet. */
import { ChevronRight, Plus } from "@lucide/vue";
import { computed, ref } from "vue";

import { uuid } from "@/lib/device";
import { t } from "@/lib/i18n";
import { edit } from "@/stores/visits";

import FormSheet from "./FormSheet.vue";
import Pill from "./Pill.vue";

const props = defineProps({
	record: { type: Object, required: true },
	table: { type: String, required: true },
	heading: { type: String, required: true },
	/** Singular noun for buttons and sheet titles: "finding", "expense". */
	noun: { type: String, required: true },
	emptyText: { type: String, default: "" },
	fields: { type: Array, required: true },
	defaults: { type: Object, default: () => ({}) },
	/** (row) => { title, subtitle, pill: { text, tone } } */
	describe: { type: Function, required: true },
	readonly: { type: Boolean, default: false },
});

const rows = computed(() => props.record.data[props.table] || []);
const sheetOpen = ref(false);
const editing = ref(null);

function open(row = null) {
	if (props.readonly) return;
	editing.value = row;
	sheetOpen.value = true;
}

function save(values) {
	const key = editing.value?._key;
	edit(props.record.name, (data) => {
		const list = (data[props.table] ||= []);
		const index = key ? list.findIndex((row) => row._key === key) : -1;
		if (index >= 0) list[index] = { ...list[index], ...values };
		else list.push({ ...values, _key: uuid() });
	});
	sheetOpen.value = false;
}

function remove() {
	const key = editing.value?._key;
	edit(props.record.name, (data) => {
		data[props.table] = (data[props.table] || []).filter((row) => row._key !== key);
	});
	sheetOpen.value = false;
}
</script>

<template>
	<section>
		<div class="mb-2 flex items-center justify-between px-1">
			<h2 class="section-title mb-0 px-0">
				{{ heading }}
				<span v-if="rows.length" class="numeric">({{ rows.length }})</span>
			</h2>
		</div>

		<ul v-if="rows.length" class="card-outline divide-y divide-line overflow-hidden">
			<li v-for="row in rows" :key="row._key">
				<component
					:is="readonly ? 'div' : 'button'"
					:type="readonly ? undefined : 'button'"
					class="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-start"
					:class="readonly ? '' : 'active:bg-sunken'"
					@click="open(row)"
				>
					<div class="min-w-0 flex-1">
						<p class="truncate font-semibold text-ink">{{ describe(row).title }}</p>
						<p v-if="describe(row).subtitle" class="line-clamp-2 text-sm text-ink-2">{{ describe(row).subtitle }}</p>
					</div>
					<Pill v-if="describe(row).pill" :tone="describe(row).pill.tone">{{ describe(row).pill.text }}</Pill>
					<ChevronRight v-if="!readonly" :size="18" class="shrink-0 text-ink-3" aria-hidden="true" />
				</component>
			</li>
		</ul>
		<p v-else class="card px-4 py-5 text-center text-ink-2">{{ emptyText }}</p>

		<button v-if="!readonly" type="button" class="btn-secondary btn-block mt-3" @click="open()">
			<Plus :size="20" aria-hidden="true" />
			{{ t("Add {noun}", { noun: t(noun) }) }}
		</button>

		<FormSheet
			:open="sheetOpen"
			:title="editing ? t('Edit {noun}', { noun: t(noun) }) : t('Add {noun}', { noun: t(noun) })"
			:fields="fields"
			:row="editing"
			:defaults="defaults"
			@close="sheetOpen = false"
			@save="save"
			@remove="remove"
		/>
	</section>
</template>
