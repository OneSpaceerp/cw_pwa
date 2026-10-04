<script setup>
/**
 * A bottom-sheet form described by data.
 *
 * fields: [{ key, label, type, options, required, placeholder, hint, unit, search }]
 * types:  text | textarea | number | select | choice | date | lookup
 *
 * A `lookup` field searches the server as the engineer types (`search(query)` returns
 * [{ label, sub, values }]) and copies `values` into the row when one is picked. It
 * needs a connection; the plain text field beside it always works.
 */
import { LoaderCircle, Search, Trash2 } from "@lucide/vue";
import { reactive, ref, watch } from "vue";

import { t } from "@/lib/i18n";

import BottomSheet from "./BottomSheet.vue";

const props = defineProps({
	open: { type: Boolean, default: false },
	title: { type: String, default: "" },
	fields: { type: Array, required: true },
	/** The row being edited, or null when adding. */
	row: { type: Object, default: null },
	defaults: { type: Object, default: () => ({}) },
});
const emit = defineEmits(["close", "save", "remove"]);

const form = reactive({});
const errors = reactive({});
const lookup = reactive({ query: "", results: [], busy: false, error: "" });
let lookupTimer = null;

watch(
	() => props.open,
	(open) => {
		if (!open) return;
		for (const key of Object.keys(form)) delete form[key];
		for (const key of Object.keys(errors)) delete errors[key];
		Object.assign(form, props.defaults, props.row || {});
		Object.assign(lookup, { query: "", results: [], busy: false, error: "" });
	}
);

function runLookup(field) {
	clearTimeout(lookupTimer);
	const query = lookup.query.trim();
	if (query.length < 2) {
		lookup.results = [];
		return;
	}
	lookupTimer = setTimeout(async () => {
		lookup.busy = true;
		lookup.error = "";
		try {
			lookup.results = await field.search(query);
		} catch (error) {
			lookup.results = [];
			lookup.error = error.network ? t("Search needs a connection. Type the name below instead.") : error.message;
		} finally {
			lookup.busy = false;
		}
	}, 300);
}

function pick(result) {
	Object.assign(form, result.values);
	lookup.query = "";
	lookup.results = [];
}

function save() {
	for (const key of Object.keys(errors)) delete errors[key];
	for (const field of props.fields) {
		const value = form[field.key];
		const empty = value === undefined || value === null || String(value).trim() === "";
		if (field.required && empty) errors[field.key] = t("{field} is required.", { field: t(field.label) });
		else if (field.type === "number" && !empty && !Number.isFinite(Number(value))) errors[field.key] = t("Enter a number.");
		else if (field.type === "number" && !empty && field.min !== undefined && Number(value) < field.min) {
			errors[field.key] = t("Must be at least {min}.", { min: field.min });
		}
	}
	if (Object.keys(errors).length) {
		// Take the engineer to the first problem instead of leaving it off screen.
		const first = props.fields.find((field) => errors[field.key]);
		document.getElementById(`fs-${first.key}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
		return;
	}

	const out = { ...form };
	for (const field of props.fields) {
		if (field.type === "number" && out[field.key] !== undefined && out[field.key] !== "" && out[field.key] !== null) {
			out[field.key] = Number(out[field.key]);
		}
	}
	emit("save", out);
}
</script>

<template>
	<BottomSheet :open="open" :title="title" @close="emit('close')">
		<form class="space-y-4 pt-1" novalidate @submit.prevent="save">
			<div v-for="field in fields" :key="field.key">
				<label class="field-label" :for="`fs-${field.key}`">
					{{ field.label }}
					<span v-if="field.required" class="text-bad" aria-hidden="true">*</span>
					<span v-else class="font-medium text-ink-3">(optional)</span>
				</label>

				<textarea
					v-if="field.type === 'textarea'"
					:id="`fs-${field.key}`"
					v-model="form[field.key]"
					class="field min-h-[96px] resize-none"
					rows="3"
					:placeholder="field.placeholder"
					:aria-invalid="Boolean(errors[field.key])"
				></textarea>

				<select
					v-else-if="field.type === 'select'"
					:id="`fs-${field.key}`"
					v-model="form[field.key]"
					class="field"
					:aria-invalid="Boolean(errors[field.key])"
				>
					<option :value="undefined" disabled>Select</option>
					<option v-for="option in field.options" :key="option.value ?? option" :value="option.value ?? option">
						{{ option.label ?? option }}
					</option>
				</select>

				<div v-else-if="field.type === 'choice'" :id="`fs-${field.key}`" class="flex flex-wrap gap-2" role="radiogroup" :aria-label="field.label">
					<button
						v-for="option in field.options"
						:key="option"
						type="button"
						role="radio"
						:aria-checked="form[field.key] === option"
						class="min-h-[44px] rounded-full border px-4 text-sm font-bold transition-colors"
						:class="form[field.key] === option ? 'border-brand-strong bg-brand-strong text-on-brand' : 'border-line bg-surface text-ink-2'"
						@click="form[field.key] = option"
					>
						{{ option }}
					</button>
				</div>

				<div v-else-if="field.type === 'lookup'">
					<div class="relative">
						<Search :size="18" class="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden="true" />
						<input
							:id="`fs-${field.key}`"
							v-model="lookup.query"
							type="search"
							class="field ps-10"
							:placeholder="field.placeholder"
							autocomplete="off"
							@input="runLookup(field)"
						/>
						<LoaderCircle v-if="lookup.busy" :size="18" class="spin absolute end-3.5 top-1/2 -mt-[9px] text-ink-3" aria-hidden="true" />
					</div>
					<p v-if="form[field.key]" class="mt-2 flex items-center justify-between gap-2 rounded-control px-3 py-2 text-sm font-semibold tone-brand">
						<span class="truncate">Linked to stock item {{ form[field.key] }}</span>
						<button type="button" class="shrink-0 underline" @click="form[field.key] = null">Unlink</button>
					</p>
					<ul v-if="lookup.results.length" class="mt-2 divide-y divide-line overflow-hidden rounded-control border border-line">
						<li v-for="result in lookup.results" :key="result.label + result.sub">
							<button type="button" class="block min-h-[48px] w-full px-4 py-2 text-start active:bg-sunken" @click="pick(result)">
								<span class="block font-semibold text-ink">{{ result.label }}</span>
								<span class="block text-sm text-ink-3">{{ result.sub }}</span>
							</button>
						</li>
					</ul>
					<p v-if="lookup.error" class="field-error">{{ lookup.error }}</p>
				</div>

				<div v-else class="relative">
					<input
						:id="`fs-${field.key}`"
						v-model="form[field.key]"
						class="field"
						:class="field.unit ? 'pe-16' : ''"
						:type="field.type === 'date' ? 'date' : 'text'"
						:inputmode="field.type === 'number' ? 'decimal' : undefined"
						:placeholder="field.placeholder"
						:aria-invalid="Boolean(errors[field.key])"
						autocomplete="off"
					/>
					<span v-if="field.unit" class="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-3">
						{{ field.unit }}
					</span>
				</div>

				<p v-if="errors[field.key]" class="field-error" role="alert">{{ errors[field.key] }}</p>
				<p v-else-if="field.hint" class="mt-1.5 text-sm text-ink-3">{{ field.hint }}</p>
			</div>

			<div class="flex gap-3 pt-2">
				<button v-if="row" type="button" class="btn-secondary px-4 text-bad" aria-label="Delete" @click="emit('remove')">
					<Trash2 :size="20" aria-hidden="true" />
				</button>
				<button type="submit" class="btn-primary flex-1">{{ row ? "Save" : "Add" }}</button>
			</div>
		</form>
	</BottomSheet>
</template>
