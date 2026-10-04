<script setup>
import { ChevronLeft, ChevronRight, CircleAlert, X } from "@lucide/vue";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";

import EmptyState from "@/components/EmptyState.vue";
import PageHeader from "@/components/PageHeader.vue";
import SyncChip from "@/components/SyncChip.vue";
import TableStep from "@/components/TableStep.vue";
import { call } from "@/lib/api";
import { dayLabel, SEVERITY_TONE, STATUS } from "@/lib/format";
import { t } from "@/lib/i18n";
import { EDITABLE_STATUSES } from "@/lib/rules";
import { catalogue, options } from "@/stores/masters";
import { isLocalId } from "@/stores/outbox";
import { session } from "@/stores/session";
import { clearServerError, openVisit, visits } from "@/stores/visits";

import StepChecklist from "./run/StepChecklist.vue";
import StepPhotos from "./run/StepPhotos.vue";
import StepReadings from "./run/StepReadings.vue";
import StepReview from "./run/StepReview.vue";

const props = defineProps({
	name: { type: String, required: true },
	step: { type: String, default: "" },
});
const router = useRouter();

const record = computed(() => visits.records[props.name]);
const loadError = ref("");
const scroller = ref(null);
const previous = ref({});

const editable = computed(
	() => record.value && record.value.data.docstatus !== 1 && EDITABLE_STATUSES.includes(record.value.data.visit_status)
);

const STEPS = [
	{ id: "checklist", label: "Checklist" },
	{ id: "readings", label: "Readings" },
	{ id: "findings", label: "Findings" },
	{ id: "photos", label: "Photos" },
	{ id: "work", label: "Work done" },
	{ id: "needs", label: "Requests" },
	{ id: "review", label: "Submit" },
];
// A visit that is no longer editable is shown read-only, without the submit step.
// The step stays while it is the one on screen, so submitting does not pull the
// screen out from under itself before it has navigated away.
const steps = computed(() =>
	editable.value || props.step === "review" ? STEPS : STEPS.filter((item) => item.id !== "review")
);

const index = computed(() => Math.max(0, steps.value.findIndex((item) => item.id === props.step)));
const current = computed(() => steps.value[index.value]);

function goto(id) {
	router.replace({ name: "visit-run", params: { name: props.name, step: id } });
}
const next = () => index.value < steps.value.length - 1 && goto(steps.value[index.value + 1].id);
const back = () => index.value > 0 && goto(steps.value[index.value - 1].id);
const leave = () => router.replace({ name: "visit", params: { name: props.name } });

watch(index, () =>
	nextTick(() => {
		scroller.value?.scrollTo({ top: 0 });
		// Keep the current step visible in the strip of step buttons.
		document.querySelector('[aria-current="step"]')?.scrollIntoView({ inline: "center", block: "nearest" });
	})
);

// How many items in each step still stop the submission, shown as a dot on the step.
const stepDone = computed(() => {
	const data = record.value?.data || {};
	return {
		checklist: (data.checklist_items || []).every((row) => !row.is_mandatory || row.response || row.response_value),
		readings: (data.readings || []).length >= (Number(data.rules?.min_readings) || 0) && (data.readings || []).every((row) => String(row.reading_value ?? "").trim()),
	};
});

// ------------------------------------------------------------- table steps
const currency = computed(() => catalogue().currency || "");

const findingFields = computed(() => [
	{ key: "category", label: "Category", type: "select", required: true, options: catalogue().finding_categories.map((row) => row.name) },
	{ key: "severity", label: "Severity", type: "choice", required: true, options: options("severity").length ? options("severity") : ["Info", "Minor", "Major", "Critical"] },
	{ key: "observation", label: "What you observed", type: "textarea", required: true },
	{ key: "recommendation", label: "Recommendation", type: "textarea" },
]);
const operationFields = computed(() => [
	{ key: "operation_type", label: "Operation", type: "select", required: true, options: catalogue().operation_types.map((row) => row.name) },
	{ key: "area_or_equipment", label: "Area or equipment", type: "text", required: true, placeholder: "e.g. Cooling tower basin" },
	{ key: "duration_minutes", label: "Duration", type: "number", unit: "min", min: 0 },
	{ key: "chemicals_used", label: "Chemicals or materials used", type: "textarea" },
	{ key: "outcome", label: "Result", type: "choice", required: true, options: options("operation_outcome").length ? options("operation_outcome") : ["Successful", "Partially Successful", "Incomplete", "Failed"] },
	{ key: "remarks", label: "Notes", type: "textarea" },
]);
const requirementFields = computed(() => [
	{
		key: "item_code",
		label: "Find a stock item",
		type: "lookup",
		placeholder: "Search by name or code",
		search: async (query) =>
			(await call("cw_visit.api.v1.search_items", { query })).map((item) => ({
				label: item.item_name,
				sub: item.name,
				values: { item_code: item.name, item_name: item.item_name },
			})),
	},
	{ key: "item_name", label: "Item or material needed", type: "text", required: true },
	{ key: "quantity", label: "Quantity", type: "number", required: true, min: 0 },
	{ key: "urgency", label: "Urgency", type: "choice", required: true, options: options("urgency").length ? options("urgency") : ["Normal", "Urgent", "Emergency"] },
	{ key: "reason", label: "Why it is needed", type: "textarea", required: true },
]);
const expenseFields = computed(() => [
	{ key: "expense_type", label: "Type", type: "select", required: true, options: options("expense_type") },
	{ key: "amount", label: "Amount", type: "number", required: true, unit: currency.value, min: 0 },
	{ key: "remarks", label: "Notes", type: "textarea", hint: "Add a photo of the receipt in the Photos step, under Expense Receipt." },
]);
const actionFields = [
	{ key: "action_description", label: "What needs to happen", type: "textarea", required: true },
	{ key: "due_date", label: "Due date", type: "date" },
	{ key: "remarks", label: "Notes", type: "textarea" },
];

const DECISION_TONE = { Approved: "ok", Rejected: "bad", Pending: "muted" };

// ---------------------------------------------------------------- loading
onMounted(async () => {
	try {
		await openVisit(props.name);
	} catch (error) {
		loadError.value = error.network ? "This visit is not saved on this phone. Connect to the internet to open it." : error.message;
		return;
	}
	if (!props.step) goto(steps.value[0].id);
	loadPrevious();
});

// Last approved readings at this site, to compare against. A nice-to-have: skipped when offline.
async function loadPrevious() {
	if (!session.online || isLocalId(props.name)) return;
	try {
		const history = await call("cw_visit.api.v1.site_history", { name: props.name, limit: 3 });
		const map = {};
		for (const visit of history) {
			for (const reading of visit.readings || []) {
				if (!map[reading.parameter]) {
					map[reading.parameter] = { reading_value: reading.reading_value, unit: reading.unit, date: dayLabel(visit.planned_date) };
				}
			}
		}
		previous.value = map;
	} catch {
		// comparison data is optional
	}
}
</script>

<template>
	<div class="flex h-full flex-col">
		<PageHeader :title="current?.label || 'Visit'" :subtitle="record?.data.customer_name || ''">
			<template #actions>
				<SyncChip />
				<button type="button" class="icon-btn" aria-label="Close and return to the visit" @click="leave">
					<X :size="24" aria-hidden="true" />
				</button>
			</template>
			<template #below>
				<nav class="scroll-area mx-auto flex max-w-xl gap-1.5 overflow-x-auto px-3 pb-3" aria-label="Visit steps">
					<button
						v-for="(item, position) in steps"
						:key="item.id"
						type="button"
						class="relative min-h-[40px] shrink-0 rounded-full px-3.5 text-sm font-bold transition-colors"
						:class="position === index ? 'bg-brand-strong text-on-brand' : 'bg-sunken text-ink-2'"
						:aria-current="position === index ? 'step' : undefined"
						@click="goto(item.id)"
					>
						<span class="numeric me-1 opacity-70">{{ position + 1 }}</span>{{ item.label }}
						<span
							v-if="editable && stepDone[item.id] === false"
							class="absolute -end-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-surface bg-warn"
						>
							<span class="sr-only">has items to finish</span>
						</span>
					</button>
				</nav>
			</template>
		</PageHeader>

		<div ref="scroller" class="scroll-area min-h-0 flex-1">
			<div class="mx-auto max-w-xl px-4 pb-8 pt-4">
				<EmptyState v-if="loadError" :icon="CircleAlert" title="Cannot open this visit" :text="loadError">
					<button type="button" class="btn-secondary" @click="router.replace({ name: 'visits' })">Back to visits</button>
				</EmptyState>

				<div v-else-if="!record" class="space-y-3" aria-busy="true">
					<div v-for="n in 3" :key="n" class="skeleton h-28"></div>
				</div>

				<template v-else>
					<div v-if="record.serverError" class="mb-4 rounded-card p-4 tone-bad" role="alert">
						<p class="font-bold">The server did not accept the last change</p>
						<p class="mt-1 whitespace-pre-line text-sm font-medium">{{ record.serverError }}</p>
						<button type="button" class="mt-2 min-h-[44px] text-sm font-bold underline" @click="clearServerError(name)">Dismiss</button>
					</div>

					<p v-if="!editable" class="mb-4 rounded-card px-4 py-3 text-sm font-semibold tone-info">
						{{ t("This visit is {status} and can no longer be changed.", { status: t((STATUS[record.data.visit_status] || {}).label || record.data.visit_status) }) }}
					</p>

					<StepChecklist v-if="current.id === 'checklist'" :record="record" :readonly="!editable" />
					<StepReadings v-else-if="current.id === 'readings'" :record="record" :previous="previous" :readonly="!editable" />

					<TableStep
						v-else-if="current.id === 'findings'"
						:record="record"
						table="findings"
						heading="Findings"
						noun="finding"
						empty-text="Nothing found? Leave this empty and continue."
						:fields="findingFields"
						:defaults="{ severity: 'Minor' }"
						:describe="(row) => ({ title: row.category, subtitle: row.observation, pill: { text: row.severity, tone: SEVERITY_TONE[row.severity] || 'muted' } })"
						:readonly="!editable"
					/>

					<StepPhotos v-else-if="current.id === 'photos'" :record="record" :readonly="!editable" />

					<TableStep
						v-else-if="current.id === 'work'"
						:record="record"
						table="operations"
						heading="Washing, cleaning and other work"
						noun="work item"
						empty-text="Record each operation you carried out on site."
						:fields="operationFields"
						:defaults="{ outcome: 'Successful', duration_minutes: 30 }"
						:describe="(row) => ({ title: row.operation_type, subtitle: [row.area_or_equipment, row.duration_minutes ? t('{n} min', { n: row.duration_minutes }) : ''].filter(Boolean).join(' · '), pill: { text: row.outcome, tone: row.outcome === 'Successful' ? 'ok' : 'warn' } })"
						:readonly="!editable"
					/>

					<div v-else-if="current.id === 'needs'" class="space-y-6">
						<TableStep
							:record="record"
							table="requirements"
							heading="Equipment and materials needed"
							noun="request"
							empty-text="Nothing needed from stores or purchasing."
							:fields="requirementFields"
							:defaults="{ quantity: 1, urgency: 'Normal' }"
							:describe="(row) => ({ title: `${row.quantity || 1} × ${row.item_name || row.item_code}`, subtitle: row.reason, pill: row.supervisor_decision && row.supervisor_decision !== 'Pending' ? { text: row.supervisor_decision, tone: DECISION_TONE[row.supervisor_decision] } : row.urgency !== 'Normal' ? { text: row.urgency, tone: 'warn' } : null })"
							:readonly="!editable"
						/>
						<TableStep
							:record="record"
							table="expenses"
							heading="Expenses on this visit"
							noun="expense"
							empty-text="No expenses."
							:fields="expenseFields"
							:describe="(row) => ({ title: row.expense_type, subtitle: row.remarks, pill: { text: `${row.amount ?? 0} ${currency}`.trim(), tone: 'muted' } })"
							:readonly="!editable"
						/>
						<TableStep
							:record="record"
							table="actions"
							heading="Follow-up actions"
							noun="follow-up"
							empty-text="No follow-up needed."
							:fields="actionFields"
							:describe="(row) => ({ title: row.action_description, subtitle: row.due_date ? t('Due {date}', { date: dayLabel(row.due_date) }) : '', pill: row.status ? { text: row.status, tone: 'muted' } : null })"
							:readonly="!editable"
						/>
					</div>

					<StepReview v-else-if="current.id === 'review'" :record="record" @goto="goto" @submitted="leave" />
				</template>
			</div>
		</div>

		<!-- Step navigation stays above the keyboard and the home indicator. -->
		<footer
			v-if="record && current?.id !== 'review'"
			class="z-10 shrink-0 bg-surface px-4 pt-3 shadow-bar"
			:style="{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--keyboard-inset, 0px) + 12px)' }"
		>
			<div class="mx-auto flex max-w-xl gap-3">
				<button type="button" class="btn-secondary px-4" :disabled="index === 0" aria-label="Previous step" @click="back">
					<ChevronLeft :size="22" aria-hidden="true" />
				</button>
				<button v-if="index < steps.length - 1" type="button" class="btn-primary flex-1" @click="next">
					{{ t("Next: {step}", { step: t(steps[index + 1].label) }) }}
					<ChevronRight :size="20" aria-hidden="true" />
				</button>
				<button v-else type="button" class="btn-primary flex-1" @click="leave">Done</button>
			</div>
		</footer>
	</div>
</template>
