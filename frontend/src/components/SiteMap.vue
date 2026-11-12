<script setup>
// The site on a free map (OpenStreetMap, no key), with the check-in point, the
// engineer's position and, during a visit, the distances at which the app warns and
// checks out. Leaflet is loaded only when a map is shown.
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";

import { t } from "@/lib/i18n";
import { hasCoordinates } from "@/lib/rules";

const props = defineProps({
	site: { type: Object, default: null }, // { latitude, longitude, geofence_radius_meters, location_name }
	checkin: { type: Object, default: null }, // { latitude, longitude }
	me: { type: Object, default: null }, // { latitude, longitude, accuracy }
	rings: { type: Array, default: () => [] }, // [{ meters, tone }] drawn around the check-in point (or the site)
	height: { type: Number, default: 220 },
});

const el = ref(null);
const failed = ref(false);
const map = shallowRef(null);
let L = null;
let layer = null;

const TONES = { brand: "#0097B2", warn: "#d97706", bad: "#dc2626", ok: "#16a34a", me: "#2563eb" };

function point(value) {
	return value && hasCoordinates(value.latitude, value.longitude) ? [Number(value.latitude), Number(value.longitude)] : null;
}

function draw() {
	if (!map.value || !L) return;
	layer?.remove();
	layer = L.layerGroup().addTo(map.value);
	const bounds = [];

	const site = point(props.site);
	if (site) {
		if (props.site.geofence_radius_meters) {
			L.circle(site, { radius: Number(props.site.geofence_radius_meters), color: TONES.brand, weight: 1, fillOpacity: 0.08 }).addTo(layer);
		}
		L.circleMarker(site, { radius: 9, color: "#fff", weight: 3, fillColor: TONES.brand, fillOpacity: 1 })
			.bindTooltip(props.site.location_name || t("Site"))
			.addTo(layer);
		bounds.push(site);
	}

	const checkin = point(props.checkin);
	const centre = checkin || site;
	if (checkin) {
		L.circleMarker(checkin, { radius: 6, color: "#fff", weight: 2, fillColor: TONES.ok, fillOpacity: 1 })
			.bindTooltip(t("Check-in point"))
			.addTo(layer);
		bounds.push(checkin);
	}
	if (centre) {
		for (const ring of props.rings) {
			if (!ring.meters) continue;
			const circle = L.circle(centre, {
				radius: ring.meters,
				color: TONES[ring.tone] || TONES.warn,
				weight: 1.5,
				dashArray: "6 6",
				fill: false,
			}).addTo(layer);
			bounds.push(...[circle.getBounds().getNorthWest(), circle.getBounds().getSouthEast()].map((p) => [p.lat, p.lng]));
		}
	}

	const me = point(props.me);
	if (me) {
		if (props.me.accuracy) {
			L.circle(me, { radius: Number(props.me.accuracy), color: TONES.me, weight: 0, fillOpacity: 0.12 }).addTo(layer);
		}
		L.circleMarker(me, { radius: 7, color: "#fff", weight: 3, fillColor: TONES.me, fillOpacity: 1 })
			.bindTooltip(t("You"))
			.addTo(layer);
		bounds.push(me);
	}

	if (bounds.length > 1) map.value.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 });
	else if (bounds.length === 1) map.value.setView(bounds[0], 16);
}

onMounted(async () => {
	try {
		const module = await import("leaflet");
		await import("leaflet/dist/leaflet.css");
		L = module.default || module;
		map.value = L.map(el.value, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
		L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
			maxZoom: 19,
			attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
		}).addTo(map.value);
		draw();
	} catch {
		failed.value = true;
	}
});

watch(() => [props.site, props.checkin, props.me, props.rings], draw, { deep: true });

onBeforeUnmount(() => {
	map.value?.remove();
	map.value = null;
});
</script>

<template>
	<div class="relative overflow-hidden rounded-control border border-line bg-sunken" :style="{ height: `${height}px` }" dir="ltr">
		<div ref="el" class="h-full w-full" role="img" :aria-label="t('Map of the site')"></div>
		<p v-if="failed" class="absolute inset-0 grid place-items-center p-4 text-center text-sm text-ink-3">
			{{ t("The map needs an internet connection.") }}
		</p>
	</div>
</template>
