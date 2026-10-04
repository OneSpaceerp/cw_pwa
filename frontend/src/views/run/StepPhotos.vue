<script setup>
import { Camera, CircleAlert, CloudUpload, FileText, Image as ImageIcon, Trash2 } from "@lucide/vue";
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";

import { options } from "@/stores/masters";
import { t } from "@/lib/i18n";
import { settings } from "@/stores/session";
import { confirm, toast, toastError } from "@/stores/ui";
import { addPhoto, localPhotoUrl, photoCount, removePhoto } from "@/stores/visits";

const props = defineProps({
	record: { type: Object, required: true },
	readonly: { type: Boolean, default: false },
});

const categories = computed(() => {
	const list = options("evidence_category");
	return list.length ? list : ["Before Inspection", "During Operation", "After Operation", "Other"];
});
const category = ref("During Operation");
const busy = ref(false);
const minimum = computed(() => Number(props.record.data.rules?.min_evidence_photos) || 0);

// Photos waiting to upload live in IndexedDB; make object URLs to preview them.
const previews = reactive({});
watch(
	() => props.record.localPhotos.map((photo) => photo.id),
	async (ids) => {
		for (const id of ids) if (!previews[id]) previews[id] = await localPhotoUrl(id);
		for (const id of Object.keys(previews)) {
			if (!ids.includes(id)) {
				URL.revokeObjectURL(previews[id]);
				delete previews[id];
			}
		}
	},
	{ immediate: true }
);
onBeforeUnmount(() => Object.values(previews).forEach((url) => URL.revokeObjectURL(url)));

const photos = computed(() => [
	...(props.record.data.evidence || []).map((row) => ({
		key: row._key || row.name,
		name: row.name,
		url: row.file,
		isImage: /\.(jpe?g|png|webp)$/i.test(row.file || ""),
		category: row.category,
		caption: row.caption,
		local: false,
	})),
	...props.record.localPhotos.map((photo) => ({
		key: photo.id,
		id: photo.id,
		url: previews[photo.id],
		isImage: true,
		category: photo.category,
		caption: photo.caption,
		local: true,
		failed: photo.failed,
	})),
]);

async function onFiles(event) {
	const files = [...event.target.files];
	event.target.value = ""; // allow picking the same file again
	if (!files.length) return;

	const limit = (settings().max_evidence_file_size_mb || 10) * 1024 * 1024;
	busy.value = true;
	try {
		for (const file of files) {
			// Photos are compressed before the size check; other files are checked as they are.
			if (!file.type.startsWith("image/") && file.size > limit) {
				toast(t("{file} is larger than {size} MB.", { file: file.name, size: settings().max_evidence_file_size_mb || 10 }), "bad");
				continue;
			}
			await addPhoto(props.record.name, file, { category: category.value });
		}
	} catch (error) {
		toastError(error, "The photo could not be saved.");
	} finally {
		busy.value = false;
	}
}

async function remove(photo) {
	if (await confirm({ title: t("Remove this photo?"), confirmLabel: t("Remove"), cancelLabel: t("Cancel"), danger: true })) {
		await removePhoto(props.record.name, photo);
	}
}
</script>

<template>
	<section>
		<p v-if="minimum" class="mb-3 px-1 text-sm font-semibold text-ink-2">
			This service type needs at least <span class="numeric">{{ minimum }}</span> photo(s). You have
			<span class="numeric">{{ photoCount(record) }}</span>.
		</p>

		<div v-if="!readonly" class="card p-4">
			<label class="field-label" for="photo-category">Photo of</label>
			<select id="photo-category" v-model="category" class="field">
				<option v-for="item in categories" :key="item" :value="item">{{ item }}</option>
			</select>

			<div class="mt-3 grid grid-cols-2 gap-3">
				<label class="btn-primary cursor-pointer" :class="busy ? 'pointer-events-none opacity-50' : ''">
					<Camera :size="20" aria-hidden="true" />
					Take photo
					<input type="file" class="sr-only" accept="image/*" capture="environment" @change="onFiles" />
				</label>
				<label class="btn-secondary cursor-pointer" :class="busy ? 'pointer-events-none opacity-50' : ''">
					<ImageIcon :size="20" aria-hidden="true" />
					Choose
					<input type="file" class="sr-only" accept="image/*,application/pdf" multiple @change="onFiles" />
				</label>
			</div>
		</div>

		<ul v-if="photos.length" class="mt-4 grid grid-cols-2 gap-3">
			<li v-for="photo in photos" :key="photo.key" class="card overflow-hidden">
				<div class="relative aspect-square bg-sunken">
					<img
						v-if="photo.isImage && photo.url"
						:src="photo.url"
						:alt="photo.caption || photo.category"
						class="h-full w-full object-cover"
						loading="lazy"
						decoding="async"
					/>
					<div v-else class="flex h-full w-full items-center justify-center text-ink-3">
						<FileText :size="36" aria-hidden="true" />
					</div>

					<span v-if="photo.failed" class="absolute start-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold tone-bad">
						<CircleAlert :size="12" aria-hidden="true" />
						Upload failed
					</span>
					<span v-else-if="photo.local" class="absolute start-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold tone-warn">
						<CloudUpload :size="12" aria-hidden="true" />
						Waiting
					</span>

					<button
						v-if="!readonly"
						type="button"
						class="absolute end-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white"
						aria-label="Remove photo"
						@click="remove(photo)"
					>
						<Trash2 :size="18" aria-hidden="true" />
					</button>
				</div>
				<p class="truncate px-3 py-2 text-xs font-semibold text-ink-2">{{ photo.category }}</p>
			</li>
		</ul>
		<p v-else class="mt-4 px-1 text-center text-ink-2">No photos yet.</p>
	</section>
</template>
