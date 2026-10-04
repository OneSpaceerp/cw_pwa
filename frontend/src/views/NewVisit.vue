<script setup>
import { Building2, Check, LoaderCircle, MapPin, Plus, Search, X } from "@lucide/vue";
import { computed, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";

import PageHeader from "@/components/PageHeader.vue";
import StartSheet from "@/components/StartSheet.vue";
import { call } from "@/lib/api";
import { vibrate } from "@/lib/device";
import { catalogue, options } from "@/stores/masters";
import { session, settings } from "@/stores/session";
import { toastError } from "@/stores/ui";
import { createVisit } from "@/stores/visits";

const router = useRouter();

const form = reactive({
	customer: null,
	location: null,
	newLocation: null, // { location_name, address }
	visitType: "",
	priority: "Medium",
	description: "",
});
const errors = reactive({});

const search = reactive({ query: "", results: [], busy: false, error: "" });
const locations = reactive({ items: [], busy: false, error: "" });
const proposing = ref(false);
const proposed = reactive({ location_name: "", address: "" });
const startOpen = ref(false);
const creating = ref(false);

const priorities = computed(() => (options("priority").length ? options("priority") : ["Low", "Medium", "High", "Critical"]));
const canPropose = computed(() => Boolean(settings().allow_engineer_proposed_locations));

let timer = null;
watch(
	() => search.query,
	(query) => {
		clearTimeout(timer);
		if (query.trim().length < 2) {
			search.results = [];
			return;
		}
		timer = setTimeout(async () => {
			search.busy = true;
			search.error = "";
			try {
				search.results = await call("cw_visit.api.v1.search_customers", { query: query.trim() });
			} catch (error) {
				search.results = [];
				search.error = error.network ? "Finding a customer needs a connection." : error.message;
			} finally {
				search.busy = false;
			}
		}, 300);
	}
);

async function chooseCustomer(customer) {
	form.customer = customer;
	form.location = null;
	form.newLocation = null;
	search.query = "";
	search.results = [];
	delete errors.customer;

	locations.busy = true;
	locations.error = "";
	try {
		locations.items = await call("cw_visit.api.v1.customer_locations", { customer: customer.name });
		if (locations.items.length === 1) form.location = locations.items[0];
	} catch (error) {
		locations.items = [];
		locations.error = error.network ? "The site list needs a connection." : error.message;
	} finally {
		locations.busy = false;
	}
}

function clearCustomer() {
	form.customer = null;
	form.location = null;
	form.newLocation = null;
	locations.items = [];
}

function chooseLocation(location) {
	form.location = location;
	form.newLocation = null;
	proposing.value = false;
	delete errors.location;
}

function confirmProposal() {
	if (!proposed.location_name.trim()) return;
	form.newLocation = { location_name: proposed.location_name.trim(), address: proposed.address.trim() };
	form.location = null;
	proposing.value = false;
	delete errors.location;
}

function validate() {
	for (const key of Object.keys(errors)) delete errors[key];
	if (!form.customer) errors.customer = "Choose the customer.";
	if (!form.location && !form.newLocation) errors.location = "Choose the site, or add a new one.";
	if (!form.visitType) errors.visitType = "Choose the type of service.";
	const first = Object.keys(errors)[0];
	if (first) document.getElementById(`nv-${first}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
	return !first;
}

function proceed() {
	if (validate()) startOpen.value = true;
}

// A proposed site is created at the engineer's position, so it has nothing to be compared with yet.
const siteForCheck = computed(() => form.location || null);

async function confirmStart({ position, reason }) {
	if (form.newLocation && !position) {
		toastError(new Error("A new site can only be added with a GPS location. Read the location again."));
		return;
	}
	creating.value = true;
	try {
		const name = await createVisit({
			customer: form.customer,
			visitType: form.visitType,
			location: form.location,
			newLocation: form.newLocation,
			priority: form.priority,
			description: form.description.trim(),
			position,
			reason,
			startNow: true,
		});
		vibrate(15);
		startOpen.value = false;
		router.replace({ name: "visit-run", params: { name } });
	} catch (error) {
		toastError(error, "The visit could not be created.");
	} finally {
		creating.value = false;
	}
}
</script>

<template>
	<div class="flex h-full flex-col">
		<PageHeader back :fallback="{ name: 'visits' }" title="New visit" subtitle="Log a visit you are making now" />

		<div class="scroll-area min-h-0 flex-1">
			<form class="mx-auto max-w-xl space-y-5 px-4 pb-8 pt-4" novalidate @submit.prevent="proceed">
				<!-- Customer -->
				<section id="nv-customer" class="card p-4">
					<h2 class="field-label">Customer <span class="text-bad" aria-hidden="true">*</span></h2>

					<div v-if="form.customer" class="flex items-center justify-between gap-3 rounded-control px-4 py-3 tone-brand">
						<span class="flex min-w-0 items-center gap-2 font-bold">
							<Building2 :size="18" class="shrink-0" aria-hidden="true" />
							<span class="truncate">{{ form.customer.customer_name }}</span>
						</span>
						<button type="button" class="icon-btn -mr-2 text-current" aria-label="Change customer" @click="clearCustomer">
							<X :size="20" aria-hidden="true" />
						</button>
					</div>

					<template v-else>
						<div class="relative">
							<Search :size="18" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden="true" />
							<input
								v-model="search.query"
								type="search"
								class="field pl-10"
								placeholder="Type at least 2 letters"
								aria-label="Search customers"
								autocomplete="off"
								:disabled="!session.online"
							/>
							<LoaderCircle v-if="search.busy" :size="18" class="spin absolute right-3.5 top-1/2 -mt-[9px] text-ink-3" aria-hidden="true" />
						</div>
						<p v-if="!session.online" class="mt-2 text-sm font-semibold text-warn">
							Looking up a customer needs a connection. Go online to start a new visit.
						</p>
						<ul v-if="search.results.length" class="mt-2 divide-y divide-line overflow-hidden rounded-control border border-line">
							<li v-for="customer in search.results" :key="customer.name">
								<button type="button" class="block min-h-[52px] w-full px-4 py-2 text-left active:bg-sunken" @click="chooseCustomer(customer)">
									<span class="block font-semibold text-ink">{{ customer.customer_name }}</span>
									<span v-if="customer.name !== customer.customer_name" class="block text-sm text-ink-3">{{ customer.name }}</span>
								</button>
							</li>
						</ul>
						<p v-else-if="search.query.trim().length >= 2 && !search.busy && !search.error" class="mt-2 text-sm text-ink-2">
							No customer found. New customers are added in ERPNext by the office.
						</p>
						<p v-if="search.error" class="field-error">{{ search.error }}</p>
					</template>
					<p v-if="errors.customer" class="field-error" role="alert">{{ errors.customer }}</p>
				</section>

				<!-- Site -->
				<section v-if="form.customer" id="nv-location" class="card p-4">
					<h2 class="field-label">Site <span class="text-bad" aria-hidden="true">*</span></h2>

					<p v-if="locations.busy" class="flex items-center gap-2 py-2 text-ink-2">
						<LoaderCircle :size="18" class="spin" aria-hidden="true" />
						Loading sites
					</p>
					<p v-else-if="locations.error" class="field-error">{{ locations.error }}</p>

					<ul v-else class="space-y-2" role="radiogroup" aria-label="Site">
						<li v-for="location in locations.items" :key="location.name">
							<button
								type="button"
								role="radio"
								:aria-checked="form.location?.name === location.name"
								class="flex min-h-[56px] w-full items-center gap-3 rounded-control border px-4 py-2 text-left"
								:class="form.location?.name === location.name ? 'border-brand-strong bg-brand-soft' : 'border-line bg-surface'"
								@click="chooseLocation(location)"
							>
								<MapPin :size="18" class="shrink-0 text-ink-3" aria-hidden="true" />
								<span class="min-w-0 flex-1">
									<span class="block truncate font-semibold text-ink">{{ location.location_name }}</span>
									<span v-if="location.address_display" class="block truncate text-sm text-ink-2">{{ location.address_display }}</span>
								</span>
								<Check v-if="form.location?.name === location.name" :size="20" class="shrink-0 text-brand-strong" aria-hidden="true" />
							</button>
						</li>
					</ul>

					<div v-if="form.newLocation" class="mt-2 flex items-center justify-between gap-3 rounded-control px-4 py-3 tone-warn">
						<span class="min-w-0">
							<span class="block truncate font-bold">New site: {{ form.newLocation.location_name }}</span>
							<span class="block text-sm font-medium">Saved at your current location, for a supervisor to confirm.</span>
						</span>
						<button type="button" class="icon-btn -mr-2 text-current" aria-label="Remove new site" @click="form.newLocation = null">
							<X :size="20" aria-hidden="true" />
						</button>
					</div>

					<template v-if="canPropose && !form.newLocation && !locations.busy">
						<button v-if="!proposing" type="button" class="btn-quiet btn-block mt-3" @click="proposing = true">
							<Plus :size="18" aria-hidden="true" />
							The site is not listed
						</button>
						<div v-else class="mt-3 space-y-3 rounded-control border border-line p-3">
							<div>
								<label class="field-label" for="nv-site-name">Site name <span class="text-bad" aria-hidden="true">*</span></label>
								<input id="nv-site-name" v-model="proposed.location_name" class="field" placeholder="e.g. Plant 2 cooling towers" autocomplete="off" />
							</div>
							<div>
								<label class="field-label" for="nv-site-address">Address <span class="font-medium text-ink-3">(optional)</span></label>
								<input id="nv-site-address" v-model="proposed.address" class="field" autocomplete="off" />
							</div>
							<div class="flex gap-3">
								<button type="button" class="btn-secondary flex-1" @click="proposing = false">Cancel</button>
								<button type="button" class="btn-primary flex-1" :disabled="!proposed.location_name.trim()" @click="confirmProposal">Use this site</button>
							</div>
						</div>
					</template>
					<p v-if="errors.location" class="field-error" role="alert">{{ errors.location }}</p>
				</section>

				<!-- Service -->
				<section id="nv-visitType" class="card space-y-4 p-4">
					<div>
						<label class="field-label" for="nv-type">Type of service <span class="text-bad" aria-hidden="true">*</span></label>
						<select id="nv-type" v-model="form.visitType" class="field">
							<option value="" disabled>Select</option>
							<option v-for="type in catalogue().service_types" :key="type.name" :value="type.name">{{ type.name }}</option>
						</select>
						<p v-if="errors.visitType" class="field-error" role="alert">{{ errors.visitType }}</p>
					</div>

					<div>
						<span class="field-label" id="nv-priority-label">Priority</span>
						<div class="flex gap-2" role="radiogroup" aria-labelledby="nv-priority-label">
							<button
								v-for="item in priorities"
								:key="item"
								type="button"
								role="radio"
								:aria-checked="form.priority === item"
								class="min-h-[44px] flex-1 rounded-control border text-sm font-bold"
								:class="form.priority === item ? 'border-brand-strong bg-brand-strong text-on-brand' : 'border-line bg-surface text-ink-2'"
								@click="form.priority = item"
							>
								{{ item }}
							</button>
						</div>
					</div>

					<div>
						<label class="field-label" for="nv-description">Reason for the visit <span class="font-medium text-ink-3">(optional)</span></label>
						<textarea id="nv-description" v-model="form.description" class="field min-h-[96px] resize-none" rows="3" placeholder="What the customer reported or asked for"></textarea>
					</div>
				</section>

				<button type="submit" class="btn-primary btn-block min-h-[56px] text-lg">Continue to check-in</button>
			</form>
		</div>

		<StartSheet
			:open="startOpen"
			:site="siteForCheck"
			:busy="creating"
			title="Check in"
			confirm-label="Create and start visit"
			@close="startOpen = false"
			@confirm="confirmStart"
		/>
	</div>
</template>
