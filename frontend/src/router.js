import { createRouter, createWebHistory } from "vue-router";

import { canUseApp, isSignedIn } from "./stores/session";
import { closeTopOverlayOnBack } from "./stores/ui";

// `depth` drives the direction of the page transition: deeper slides in, shallower fades back.
const routes = [
	{ path: "/login", name: "login", component: () => import("./views/Login.vue"), meta: { public: true, bare: true } },
	{ path: "/no-access", name: "no-access", component: () => import("./views/NoAccess.vue"), meta: { bare: true } },

	{ path: "/", name: "home", component: () => import("./views/Home.vue"), meta: { tab: "home", depth: 0 } },
	{ path: "/visits", name: "visits", component: () => import("./views/Visits.vue"), meta: { tab: "visits", depth: 0 } },
	{ path: "/alerts", name: "alerts", component: () => import("./views/Alerts.vue"), meta: { tab: "alerts", depth: 0 } },
	{ path: "/profile", name: "profile", component: () => import("./views/Profile.vue"), meta: { tab: "profile", depth: 0 } },

	{ path: "/sync", name: "sync", component: () => import("./views/Sync.vue"), meta: { depth: 1 } },
	{ path: "/visits/new", name: "visit-new", component: () => import("./views/NewVisit.vue"), meta: { depth: 1 } },
	{ path: "/visits/:name", name: "visit", component: () => import("./views/VisitDetail.vue"), props: true, meta: { depth: 1 } },
	{
		path: "/visits/:name/run/:step?",
		name: "visit-run",
		component: () => import("./views/VisitRun.vue"),
		props: true,
		meta: { depth: 2 },
	},

	{ path: "/:pathMatch(.*)*", redirect: "/" },
];

const router = createRouter({
	history: createWebHistory(__APP_BASE__ || "/"),
	routes,
	scrollBehavior: () => ({ top: 0 }),
});

// The guard decides what is shown. What the user may actually read or change is
// enforced by the server on every request.
router.beforeEach((to) => {
	// Back with a sheet open closes the sheet and stays on the screen.
	if (closeTopOverlayOnBack()) return false;

	if (!isSignedIn()) {
		return to.meta.public ? true : { name: "login", query: to.fullPath !== "/" ? { next: to.fullPath } : {} };
	}
	if (to.name === "login") return { name: "home" };
	if (!canUseApp()) return to.name === "no-access" ? true : { name: "no-access" };
	if (to.name === "no-access") return { name: "home" };
	return true;
});

router.afterEach((to, from) => {
	const forward = (to.meta.depth ?? 0) >= (from.meta.depth ?? 0);
	document.documentElement.style.setProperty("--page-shift", forward ? "16px" : "-16px");
});

// A lazily loaded screen can fail to load after a new version was deployed.
// Reloading picks up the current build instead of leaving a blank screen.
router.onError((error, to) => {
	if (/dynamically imported module|Importing a module script failed/i.test(error?.message || "")) {
		window.location.assign(router.resolve(to).href);
	}
});

export default router;
