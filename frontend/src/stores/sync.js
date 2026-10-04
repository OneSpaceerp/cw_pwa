/** Starts device data and keeps the outbox moving. */
import { loadMasters } from "./masters";
import { flush, loadOutbox } from "./outbox";
import { canUseApp, refreshBoot, session } from "./session";
import { loadCachedVisits, refreshList } from "./visits";

/** Bring up everything stored on the device, then talk to the server. */
export async function loadDeviceData() {
	await Promise.all([loadCachedVisits(), loadOutbox(), loadMasters()]);
	syncNow();
}

/** Send what is waiting, then refresh the visit list. Safe to call at any time. */
export async function syncNow() {
	if (!canUseApp()) return;
	// Started offline: confirm the session and get a CSRF token before sending anything.
	if (session.offlineStart) {
		await refreshBoot();
		if (session.offlineStart || !canUseApp()) return;
	}
	await flush();
	await refreshList();
}
