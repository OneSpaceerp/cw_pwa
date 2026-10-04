<script setup>
import { Droplets, Plus, Trash2 } from "@lucide/vue";
import { computed, ref } from "vue";

import BottomSheet from "@/components/BottomSheet.vue";
import EmptyState from "@/components/EmptyState.vue";
import Pill from "@/components/Pill.vue";
import { uuid } from "@/lib/device";
import { READING_TONE } from "@/lib/format";
import { classifyReading } from "@/lib/rules";
import { catalogue, parameter } from "@/stores/masters";
import { edit } from "@/stores/visits";

const props = defineProps({
	record: { type: Object, required: true },
	/** parameter id -> { reading_value, unit, date } from the last approved visit at this site */
	previous: { type: Object, default: () => ({}) },
	readonly: { type: Boolean, default: false },
});

const rows = computed(() => props.record.data.readings || []);
const pickerOpen = ref(false);
const minimum = computed(() => Number(props.record.data.rules?.min_readings) || 0);

// Parameters not yet on the visit, grouped the way the catalogue groups them.
const available = computed(() => {
	const used = new Set(rows.value.map((row) => row.parameter));
	const groups = new Map();
	for (const item of catalogue().parameters) {
		if (used.has(item.name)) continue;
		if (!groups.has(item.category)) groups.set(item.category, []);
		groups.get(item.category).push(item);
	}
	return [...groups.entries()];
});

function master(row) {
	return parameter(row.parameter) || {};
}

function range(row) {
	const low = Number(row.min_range ?? master(row).default_min_value) || 0;
	const high = Number(row.max_range ?? master(row).default_max_value) || 0;
	return { low, high, has: !(low === 0 && high === 0) };
}

// A live estimate while typing. The server sets the stored status from the same rule.
function status(row) {
	if (!String(row.reading_value ?? "").trim()) return null;
	const { low, high } = range(row);
	return classifyReading(row.reading_value, low, high, master(row).data_type || "Float", row.status);
}

function add(item) {
	edit(props.record.name, (data) => {
		(data.readings ||= []).push({
			_key: uuid(),
			parameter: item.name,
			parameter_name: item.parameter_name,
			unit: item.unit,
			min_range: item.default_min_value,
			max_range: item.default_max_value,
			reading_value: "",
			status: "Normal",
			remarks: "",
		});
	});
	pickerOpen.value = false;
}

function update(row, field, value) {
	edit(props.record.name, (data) => {
		const target = data.readings.find((item) => item._key === row._key);
		target[field] = value;
		// Clearing the escalation lets the range decide again.
		if (field === "reading_value" && target.status !== "Critical") target.status = "Normal";
	});
}

function toggleCritical(row) {
	update(row, "status", row.status === "Critical" ? "Normal" : "Critical");
}

function remove(row) {
	edit(props.record.name, (data) => {
		data.readings = data.readings.filter((item) => item._key !== row._key);
	});
}
</script>

<template>
	<section>
		<p v-if="minimum" class="mb-3 px-1 text-sm font-semibold text-ink-2">
			This service type needs at least <span class="numeric">{{ minimum }}</span> reading(s).
		</p>

		<EmptyState
			v-if="!rows.length"
			:icon="Droplets"
			title="No readings yet"
			text="Add each parameter you measure on site."
		/>

		<ul v-else class="space-y-3">
			<li v-for="row in rows" :key="row._key" class="card p-4">
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<p class="font-bold text-ink">{{ row.parameter_name || row.parameter }}</p>
						<p class="text-sm text-ink-2">
							<template v-if="range(row).has">
								Expected <span class="numeric">{{ range(row).low }} to {{ range(row).high }}</span> {{ row.unit }}
							</template>
							<template v-else>No expected range set</template>
						</p>
					</div>
					<Pill v-if="status(row)" :tone="READING_TONE[status(row)]" dot>{{ status(row) }}</Pill>
				</div>

				<div class="mt-3 flex items-center gap-2">
					<div class="relative flex-1">
						<input
							class="field numeric pr-20 text-xl font-bold"
							:value="row.reading_value"
							:inputmode="['Float', 'Int'].includes(master(row).data_type || 'Float') ? 'decimal' : 'text'"
							placeholder="Value"
							:aria-label="`${row.parameter_name || row.parameter} value in ${row.unit || 'units'}`"
							:readonly="readonly"
							enterkeyhint="next"
							@input="update(row, 'reading_value', $event.target.value)"
						/>
						<span class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-3">{{ row.unit }}</span>
					</div>
					<button v-if="!readonly" type="button" class="icon-btn text-bad" :aria-label="`Remove ${row.parameter_name || row.parameter}`" @click="remove(row)">
						<Trash2 :size="20" aria-hidden="true" />
					</button>
				</div>

				<p v-if="previous[row.parameter]" class="mt-2 text-sm text-ink-3">
					Last visit: <span class="numeric font-semibold text-ink-2">{{ previous[row.parameter].reading_value }} {{ previous[row.parameter].unit }}</span>
					({{ previous[row.parameter].date }})
				</p>

				<div v-if="status(row) && status(row) !== 'Normal'" class="mt-3 space-y-2">
					<input
						class="field"
						:value="row.remarks"
						placeholder="Note about this reading"
						:aria-label="`Note for ${row.parameter_name || row.parameter}`"
						:readonly="readonly"
						@input="update(row, 'remarks', $event.target.value)"
					/>
					<label v-if="!readonly" class="flex min-h-[44px] items-center gap-3 text-sm font-semibold text-ink-2">
						<input type="checkbox" class="h-5 w-5 accent-[var(--bad)]" :checked="row.status === 'Critical'" @change="toggleCritical(row)" />
						Mark as critical (notifies the supervisor)
					</label>
				</div>
			</li>
		</ul>

		<button v-if="!readonly" type="button" class="btn-secondary btn-block mt-3" @click="pickerOpen = true">
			<Plus :size="20" aria-hidden="true" />
			Add reading
		</button>

		<BottomSheet :open="pickerOpen" title="Add reading" @close="pickerOpen = false">
			<p v-if="!available.length" class="py-6 text-center text-ink-2">
				{{ catalogue().parameters.length ? "Every parameter is already on this visit." : "The parameter list has not been downloaded yet. Connect to the internet once to load it." }}
			</p>
			<div v-for="[category, items] in available" :key="category" class="mb-4">
				<h3 class="section-title">{{ category }}</h3>
				<ul class="divide-y divide-line overflow-hidden rounded-control border border-line">
					<li v-for="item in items" :key="item.name">
						<button type="button" class="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-2 text-left active:bg-sunken" @click="add(item)">
							<span class="font-semibold text-ink">{{ item.parameter_name }}</span>
							<span class="shrink-0 text-sm text-ink-3">{{ item.unit }}</span>
						</button>
					</li>
				</ul>
			</div>
		</BottomSheet>
	</section>
</template>
