<script setup>
import { Building2, Camera, Check, ChevronRight, LoaderCircle, MapPin, Plus, RotateCw, X } from "@lucide/vue";
import { computed, onBeforeUnmount, reactive, ref } from "vue";
import { useRouter } from "vue-router";

import CustomerPicker from "@/components/CustomerPicker.vue";
import PageHeader from "@/components/PageHeader.vue";
import StartSheet from "@/components/StartSheet.vue";
import { call } from "@/lib/api";
import { vibrate } from "@/lib/device";
import { t } from "@/lib/i18n";
import { catalogue, options } from "@/stores/masters";
import { settings } from "@/stores/session";
import { toastError } from "@/stores/ui";
import { addPhoto, createVisit } from "@/stores/visits";

const router = useRouter();

const form = reactive({
	customer: null,
	location: null,
	newLocation: null, // { location_name, address }
	visitType: "",
	priority: "Medium",
	description: "",
	photo: null, // File
});
const errors = reactive({});

const pickerOpen = ref(false);
const locations = reactive({ items: [], busy: false, error: "" });
const proposing = ref(false);
const proposed = reactive({ location_name: "", address: "" });
const startOpen = ref(false);
const creating = ref(false);
const photoUrl = ref("");

const priorities = computed(() => (options("priority").length ? options("priority") : ["Low", "Medium", "High", "Critical"]));
const canPropose = computed(() => Boolean(settings().allow_engineer_proposed_locations));
const photoRequired = computed(() => Boolean(settings().require_site_photo_for_onsite_visits));

async function chooseCustomer(customer) {
	pickerOpen.value = false;
	form.customer = customer;
	form.location = null;
	form.newLocation = null;
	delete errors.customer;

	locations.busy = true;
	locations.error = "";
	try {
		locations.items = await call("cw_visit.api.v1.customer_locations", { customer: customer.name });
		if (locations.items.length === 1) form.location = locations.items[0];
	} catch (error) {
		locations.items = [];
		locations.error = error.network ? t("The site list needs a connection.") : error.message;
	} finally {
		locations.busy = false;
	}
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

function onPhoto(event) {
	const [file] = event.target.files;
	event.target.value = "";
	if (!file) return;
	if (photoUrl.value) URL.revokeObjectURL(photoUrl.value);
	form.photo = file;
	photoUrl.value = URL.createObjectURL(file);
	delete errors.photo;
}

function clearPhoto() {
	if (photoUrl.value) URL.revokeObjectURL(photoUrl.value);
	form.photo = null;
	photoUrl.value = "";
}
onBeforeUnmount(() => photoUrl.value && URL.revokeObjectURL(photoUrl.value));

function validate() {
	for (const key of Object.keys(errors)) delete errors[key];
	if (!form.customer) errors.customer = t("Choose the customer.");
	if (form.customer && !form.location && !form.newLocation) errors.location = t("Choose the site, or add a new one.");
	if (!form.visitType) errors.visitType = t("Choose the type of service.");
	if (photoRequired.value && !form.photo) errors.photo = t("Take a photo of the site.");
	const first = Object.keys(errors)[0];
	if (first) document.getElementById(`nv-${first}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
	return !first;
}

function proceed() {
	if (validate()) startOpen.value = true;
}

async function confirmStart({ position, reason }) {
	if (form.newLocation && !position) {
		toastError(new Error(t("A new site can only be added with a GPS location. Read the location again.")));
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
		// The site photo is queued right behind the visit, as its first evidence.
		if (form.photo) await addPhoto(name, form.photo, { category: "Before Inspection", caption: "Site photo" });
		vibrate(15);
		startOpen.value = false;
		router.replace({ name: "visit-run", params: { name } });
	} catch (error) {
		toastError(error, t("The visit could not be created."));
	} finally {
		creating.value = false;
	}
}
</script>

<template>
	<div class="flex h-full flex-col">
		<PageHeader back :fallback="{ name: 'visits' }" title="New visit" subtitle="Log a visit you are making now" />

		<div class="scroll-area min-h-0 flex-1">
			<form class="mx-auto max-w-xl space-y-4 px-4 pb-8 pt-4" novalidate @submit.prevent="proceed">
				<!-- Customer -->
				<section id="nv-customer" class="card p-5">
					<h2 class="field-label">Customer <span class="text-bad" aria-hidden="true">*</span></h2>
					<button
						type="button"
						class="field flex items-center gap-3 text-start"
						:class="errors.customer ? 'border-bad' : ''"
						aria-haspopup="dialog"
						@click="pickerOpen = true"
					>
						<Building2 :size="20" class="shrink-0 text-ink-3" aria-hidden="true" />
						<span class="min-w-0 flex-1 truncate" :class="form.customer ? 'font-semibold text-ink' : 'text-ink-3'">
							{{ form.customer ? form.customer.customer_name : t("Select a customer") }}
						</span>
						<ChevronRight :size="20" class="shrink-0 text-ink-3" aria-hidden="true" />
					</button>
					<p v-if="errors.customer" class="field-error" role="alert">{{ errors.customer }}</p>
				</section>

				<!-- Site -->
				<section v-if="form.customer" id="nv-location" class="card p-5">
					<h2 class="field-label">Site <span class="text-bad" aria-hidden="true">*</span></h2>

					<p v-if="locations.busy" class="flex items-center gap-2 py-2 text-ink-2">
						<LoaderCircle :size="18" class="spin" aria-hidden="true" />
						Loading sites
					</p>
					<p v-else-if="locations.error" class="field-error">{{ locations.error }}</p>

					<ul v-else class="space-y-2" role="radiogroup" :aria-label="t('Site')">
						<li v-for="location in locations.items" :key="location.name">
							<button
								type="button"
								role="radio"
								:aria-checked="form.location?.name === location.name"
								class="flex min-h-[60px] w-full items-center gap-3 rounded-control border-[1.5px] px-4 py-2 text-start"
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
							<span class="block truncate font-bold">{{ t("New site") }}: {{ form.newLocation.location_name }}</span>
							<span class="block text-sm font-medium">Saved at your current location, for a supervisor to confirm.</span>
						</span>
						<button type="button" class="icon-btn -me-2 text-current" aria-label="Remove new site" @click="form.newLocation = null">
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

				<!-- Site photo -->
				<section id="nv-photo" class="card p-5">
					<h2 class="field-label">
						Site photo
						<span v-if="photoRequired" class="text-bad" aria-hidden="true">*</span>
						<span v-else class="font-medium text-ink-3">(optional)</span>
					</h2>

					<div v-if="photoUrl" class="relative overflow-hidden rounded-control">
						<img :src="photoUrl" alt="Site photo" class="aspect-video w-full object-cover" />
						<div class="absolute inset-x-0 bottom-0 flex gap-2 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8">
							<label class="btn min-h-[44px] flex-1 cursor-pointer bg-white/95 px-4 text-sm text-[#0e2430]">
								<RotateCw :size="16" aria-hidden="true" />
								Retake
								<input type="file" class="sr-only" accept="image/*" capture="environment" @change="onPhoto" />
							</label>
							<button type="button" class="btn min-h-[44px] bg-white/95 px-4 text-sm text-[#b91c1c]" @click="clearPhoto">Remove</button>
						</div>
					</div>

					<label
						v-else
						class="flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-2 rounded-control border-[1.5px] border-dashed px-4 py-5 text-center"
						:class="errors.photo ? 'border-bad' : 'border-line'"
					>
						<span class="icon-tile" aria-hidden="true"><Camera :size="22" /></span>
						<span class="font-bold text-brand-strong">Take a photo of the site</span>
						<span class="text-sm text-ink-2">The entrance, the plant or the equipment you came for.</span>
						<input type="file" class="sr-only" accept="image/*" capture="environment" @change="onPhoto" />
					</label>
					<p v-if="errors.photo" class="field-error" role="alert">{{ errors.photo }}</p>
				</section>

				<!-- Service -->
				<section id="nv-visitType" class="card space-y-4 p-5">
					<div>
						<label class="field-label" for="nv-type">Type of service <span class="text-bad" aria-hidden="true">*</span></label>
						<select id="nv-type" v-model="form.visitType" class="field" :class="errors.visitType ? 'border-bad' : ''">
							<option value="" disabled>{{ t("Select") }}</option>
							<option v-for="type in catalogue().service_types" :key="type.name" :value="type.name">{{ type.name }}</option>
						</select>
						<p v-if="errors.visitType" class="field-error" role="alert">{{ errors.visitType }}</p>
					</div>

					<div>
						<span id="nv-priority-label" class="field-label">Priority</span>
						<div class="flex gap-2" role="radiogroup" aria-labelledby="nv-priority-label">
							<button
								v-for="item in priorities"
								:key="item"
								type="button"
								role="radio"
								:aria-checked="form.priority === item"
								class="min-h-[46px] flex-1 rounded-full border-[1.5px] text-sm font-bold"
								:class="form.priority === item ? 'border-brand-strong bg-brand-strong text-on-brand' : 'border-line bg-surface text-ink-2'"
								@click="form.priority = item"
							>
								{{ t(item) }}
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

		<CustomerPicker :open="pickerOpen" :selected="form.customer" @close="pickerOpen = false" @select="chooseCustomer" />

		<StartSheet
			:open="startOpen"
			:site="form.location"
			:busy="creating"
			title="Check in"
			confirm-label="Create and start visit"
			@close="startOpen = false"
			@confirm="confirmStart"
		/>
	</div>
</template>
