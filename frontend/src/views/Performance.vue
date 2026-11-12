<script setup>
import { Award, ChevronDown, Lightbulb, RotateCw, Target } from "@lucide/vue";
import { computed, onMounted, ref } from "vue";

import EmptyState from "@/components/EmptyState.vue";
import PageHeader from "@/components/PageHeader.vue";
import Pill from "@/components/Pill.vue";
import { ago } from "@/lib/format";
import { i18n, locale, t } from "@/lib/i18n";
import { session } from "@/stores/session";
import { loadCachedPerformance, performance, refreshPerformance } from "@/stores/performance";

const data = computed(() => performance.data);
const month = computed(() => data.value?.month);
const rules = computed(() => data.value?.rules || {});
const quarter = computed(() => data.value?.quarter);
const showAll = ref(false);

const STATUS_TONE = { "On Track": "ok", "Needs Improvement": "warn", "No Data": "muted" };
const DECISION_TONE = { Eligible: "ok", "Not Eligible": "bad", Incomplete: "warn" };

const monthLabel = computed(() => {
	if (!month.value?.start) return "";
	const [y, m] = month.value.start.split("-").map(Number);
	return new Date(y, m - 1, 1).toLocaleDateString(locale(), { month: "long", year: "numeric" });
});
const nameOf = (row) => (i18n.lang === "ar" && row?.arabic_name ? row.arabic_name : row?.name || row?.category);
const categoryName = (key) => {
	const row = month.value?.categories.find((c) => c.category === key);
	return i18n.lang === "ar" && row?.arabic_name ? row.arabic_name : key;
};
const pct = (value) => (value == null ? "–" : `${Number(value).toLocaleString(locale(), { maximumFractionDigits: 1 })}%`);
const num = (value) => Number(value || 0).toLocaleString(locale(), { maximumFractionDigits: 2 });

// Score ring
const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ring = computed(() => {
	const total = Math.max(0, Math.min(100, Number(month.value?.total || 0)));
	return { offset: CIRCUMFERENCE * (1 - total / 100), passAt: Number(rules.value.pass_total || 85) };
});
const ringTone = computed(() => {
	const total = month.value?.total;
	if (total == null) return "var(--ink-3)";
	return total >= ring.value.passAt ? "var(--ok)" : total >= (rules.value.min_category || 70) ? "var(--warn)" : "var(--bad)";
});

const grouped = computed(() =>
	(month.value?.categories || []).map((category) => ({
		...category,
		criteria: (month.value?.criteria || []).filter((row) => row.category === category.category),
	}))
);

// Recommendations, worded here so they follow the app's language.
const TEXTS = {
	category_minimum: "{category} is at {score}%, {gap} points below its {min}% minimum. Every area must reach its minimum for the incentive.",
	total_gap: "Your total is {total}%. You need {gap} more points to reach {pass}%.",
	visits_pending: "{missed} planned visit(s) not done yet. {planned_remaining} more are planned this month: complete each one on its day.",
	respond_faster: "{missed} of {required} faults were not answered within the response time. Accept new requests as soon as they arrive.",
	close_on_time: "{missed} of {required} tickets missed their closing deadline. Close resolved tickets the same day.",
	reports_on_time: "{missed} of {required} visit reports were late or sent back. Complete the report before you leave the site.",
	customer_rating: "Customers rate you {stars} of 5. Explain the work done and ask the customer to rate the visit at check-out.",
	sales_gap: "Sales: {remaining} left to reach this month's target, about {per_day} a day for {days_left} day(s).",
	customers_gap: "{remaining} new customer(s) to reach this month's target.",
	quotations_gap: "{remaining} more quotation(s) to reach this month's target.",
	improve_criterion: "{criterion} is at {achievement}%. Ask your manager what would raise it.",
	ask_feedback: "{count} visit(s) this month have no customer rating yet. Send those customers the feedback link.",
	awaiting_review: "{count} item(s) are rated by your manager in the monthly review.",
	keep_going: "You are on track this month. Keep it up.",
	submit_open_visits: "{count} of your visits are started but not submitted. A visit counts only after you submit it for review: open it, finish it and submit.",
	nothing_measured: "Nothing counts toward this month yet. Visits you submit, requests assigned to you, customer ratings and your manager's monthly review fill in your score.",
};
function advice(item) {
	const p = item.params || {};
	return t(TEXTS[item.kind] || TEXTS.improve_criterion, {
		...p,
		score: num(p.score),
		min: num(p.min),
		gap: num(p.gap),
		total: num(p.total),
		pass: num(p.pass),
		achievement: num(p.achievement),
		remaining: num(p.remaining),
		per_day: num(p.per_day),
		stars: num(p.stars),
		category: item.category ? categoryName(item.category) : "",
		criterion: item.criterion_name || "",
	});
}
const recs = computed(() => {
	const list = data.value?.recommendations || [];
	return showAll.value ? list : list.slice(0, 4);
});

function criterionDetail(row) {
	if (row.achievement == null) {
		return row.automatic ? t("Nothing to measure yet this month") : t("Awaiting your manager's monthly review");
	}
	if (row.required) return `${num(row.actual)} / ${num(row.required)}`;
	return "";
}

onMounted(async () => {
	if (!performance.data) await loadCachedPerformance();
	refreshPerformance();
});
</script>

<template>
	<div class="flex h-full flex-col">
		<PageHeader back title="My performance" :subtitle="monthLabel" fallback="/">
			<template #actions>
				<button type="button" class="icon-btn" :aria-label="t('Refresh')" @click="refreshPerformance">
					<RotateCw :size="21" :class="performance.loading ? 'spin' : ''" aria-hidden="true" />
				</button>
			</template>
		</PageHeader>

		<div class="scroll-area min-h-0 flex-1">
			<div class="mx-auto max-w-xl space-y-4 px-4 pb-24 pt-4">
				<template v-if="!data">
					<div v-if="performance.loading" class="card h-48 skeleton" aria-busy="true"></div>
					<EmptyState
						v-else
						:icon="Target"
						:title="t('Your scorecard is not available')"
						:text="performance.error || (session.online ? t('Pull to refresh in a moment.') : t('Connect to the internet to load your scorecard.'))"
					/>
				</template>

				<EmptyState
					v-else-if="!data.available"
					:icon="Target"
					:title="t('No KPI plan yet')"
					:text="data.reason === 'no_employee' ? t('Your account is not linked to an employee record. Ask HR to link it.') : t('Your manager has not set up your KPI plan for this period yet.')"
				/>

				<template v-else>
					<!-- This month so far -->
					<section class="card p-5" aria-labelledby="perf-month">
						<div class="flex items-center gap-5">
							<svg viewBox="0 0 120 120" class="h-32 w-32 shrink-0" role="img" :aria-label="t('Score {score}', { score: pct(month.total) })">
								<circle cx="60" cy="60" :r="RADIUS" fill="none" stroke="var(--line)" stroke-width="10" />
								<circle
									cx="60"
									cy="60"
									:r="RADIUS"
									fill="none"
									:stroke="ringTone"
									stroke-width="10"
									stroke-linecap="round"
									:stroke-dasharray="CIRCUMFERENCE"
									:stroke-dashoffset="ring.offset"
									transform="rotate(-90 60 60)"
									class="transition-[stroke-dashoffset] duration-700"
								/>
								<text x="60" y="58" text-anchor="middle" class="fill-[var(--ink)] text-[24px] font-extrabold">{{ month.total == null ? "–" : Math.round(month.total) }}</text>
								<text x="60" y="78" text-anchor="middle" class="fill-[var(--ink-3)] text-[11px] font-semibold">%</text>
							</svg>
							<div class="min-w-0 flex-1 space-y-2">
								<h2 id="perf-month" class="text-lg font-extrabold text-ink">This month so far</h2>
								<Pill :tone="STATUS_TONE[month.status] || 'muted'" dot>{{ t(month.status) }}</Pill>
								<p class="text-sm text-ink-2">
									{{ t("Target {pass}% overall, and at least {min}% in every area.", { pass: num(rules.pass_total), min: num(rules.min_category) }) }}
								</p>
							</div>
						</div>
					</section>

					<!-- How to score higher -->
					<section v-if="data.recommendations?.length" aria-labelledby="perf-tips">
						<h2 id="perf-tips" class="section-title flex items-center gap-1.5">
							<Lightbulb :size="18" aria-hidden="true" /> How to score higher
						</h2>
						<ul class="card divide-y divide-line">
							<li v-for="(item, index) in recs" :key="index" class="flex gap-3 p-4">
								<span
									class="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-extrabold"
									:class="item.priority ? 'tone-bad' : item.kind === 'keep_going' ? 'tone-ok' : 'tone-brand'"
									aria-hidden="true"
								>{{ index + 1 }}</span>
								<div class="min-w-0 flex-1">
									<p class="text-ink">{{ advice(item) }}</p>
									<RouterLink
										v-if="item.kind === 'submit_open_visits'"
										:to="{ name: 'visits', query: { filter: 'open' } }"
										class="mt-1 inline-flex min-h-[44px] items-center text-sm font-bold text-brand-strong"
									>{{ t("Open my visits") }}</RouterLink>
									<p v-if="item.impact > 0" class="mt-1 text-xs font-bold text-brand-strong">
										{{ t("Up to +{points} points on your total", { points: num(item.impact) }) }}
									</p>
								</div>
							</li>
						</ul>
						<button
							v-if="data.recommendations.length > 4"
							type="button"
							class="btn-quiet btn-block mt-2"
							@click="showAll = !showAll"
						>
							<ChevronDown :size="18" :class="showAll ? 'rotate-180' : ''" aria-hidden="true" />
							{{ showAll ? t("Show fewer") : t("Show all {count}", { count: data.recommendations.length }) }}
						</button>
					</section>

					<!-- The quarter -->
					<section v-if="quarter" class="card space-y-3 p-5" aria-labelledby="perf-quarter">
						<div class="flex items-center justify-between gap-2">
							<h2 id="perf-quarter" class="flex items-center gap-1.5 text-base font-bold text-ink">
								<Award :size="18" aria-hidden="true" /> {{ quarter.period || t("This period") }}
							</h2>
							<Pill v-if="quarter.evaluation?.eligibility" :tone="DECISION_TONE[quarter.evaluation.eligibility] || 'muted'" dot>
								{{ t(quarter.evaluation.eligibility) }}
							</Pill>
						</div>
						<p class="text-sm text-ink-2">
							{{ t("{done} of {required} monthly reviews submitted", { done: quarter.reviews.length, required: quarter.months_required }) }}
						</p>
						<ol class="flex gap-2">
							<li
								v-for="index in Math.max(quarter.months_required, quarter.reviews.length)"
								:key="index"
								class="flex-1 rounded-control px-2 py-2 text-center"
								:class="quarter.reviews[index - 1] ? `tone-${STATUS_TONE[quarter.reviews[index - 1].status] || 'muted'}` : 'bg-sunken text-ink-3'"
							>
								<span class="block text-xs font-semibold">
									{{ quarter.reviews[index - 1] ? new Date(quarter.reviews[index - 1].month).toLocaleDateString(locale(), { month: "short" }) : t("Month {n}", { n: index }) }}
								</span>
								<span class="numeric block text-sm font-extrabold">{{ quarter.reviews[index - 1] ? pct(quarter.reviews[index - 1].total) : "–" }}</span>
							</li>
						</ol>
						<p v-if="quarter.evaluation && quarter.evaluation.total != null" class="text-sm text-ink-2">
							{{ t("Quarter score {score}", { score: pct(quarter.evaluation.total) }) }}
						</p>
					</section>

					<!-- Areas and criteria -->
					<section aria-labelledby="perf-areas">
						<h2 id="perf-areas" class="section-title">Your scorecard</h2>
						<div class="space-y-3">
							<details v-for="category in grouped" :key="category.category" class="card group p-4">
								<summary class="flex cursor-pointer list-none items-center gap-3">
									<div class="min-w-0 flex-1">
										<div class="flex items-center justify-between gap-2">
											<span class="truncate font-bold text-ink">{{ categoryName(category.category) }}</span>
											<span class="numeric font-extrabold" :class="category.meets_minimum === false ? 'text-bad' : 'text-ink'">{{ pct(category.score) }}</span>
										</div>
										<div class="relative mt-2 h-2.5 rounded-full bg-sunken" aria-hidden="true">
											<div
												class="h-full rounded-full"
												:class="category.meets_minimum === false ? 'bg-bad' : 'bg-brand'"
												:style="{ width: `${Math.max(0, Math.min(100, category.score || 0))}%` }"
											></div>
											<span class="absolute top-[-3px] h-4 w-0.5 bg-ink-2" :style="{ insetInlineStart: `${category.min_score}%` }"></span>
										</div>
										<p class="mt-1 text-xs text-ink-3">
											{{ t("Weight {weight}% · minimum {min}%", { weight: num(category.weight), min: num(category.min_score) }) }}
										</p>
									</div>
									<ChevronDown :size="18" class="shrink-0 text-ink-3 transition-transform group-open:rotate-180" aria-hidden="true" />
								</summary>
								<ul class="mt-3 space-y-3 border-t border-line pt-3">
									<li v-for="row in category.criteria" :key="row.code">
										<div class="flex items-center justify-between gap-2">
											<span class="min-w-0 text-sm font-semibold text-ink">{{ nameOf(row) }}</span>
											<span class="numeric text-sm font-bold" :class="row.achievement == null ? 'text-ink-3' : 'text-ink'">{{ pct(row.achievement) }}</span>
										</div>
										<div class="mt-1 h-1.5 rounded-full bg-sunken" aria-hidden="true">
											<div class="h-full rounded-full bg-brand opacity-70" :style="{ width: `${row.achievement || 0}%` }"></div>
										</div>
										<p class="mt-1 text-xs text-ink-3">{{ criterionDetail(row) }}</p>
									</li>
								</ul>
							</details>
						</div>
					</section>

					<p class="text-center text-xs text-ink-3">
						{{ t("A preview of this month so far. Your manager's monthly review is final.") }}
						<template v-if="performance.loadedAt"> · {{ t("Updated {when}", { when: ago(performance.loadedAt) }) }}</template>
					</p>
				</template>
			</div>
		</div>
	</div>
</template>
