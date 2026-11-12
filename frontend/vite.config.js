import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import { i18nExtract, translateTemplateText } from "./scripts/i18n-plugin.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Two build targets from one codebase:
 *
 *   frappe      Served by ERPNext at /cw. Assets under /assets/cw_pwa/frontend/,
 *               index.html copied to cw_pwa/www/cw.html. This is the default.
 *   standalone  A static bundle for a separate host (for example Vercel at
 *               app.cw-eg.com) that reverse-proxies /api and /files to ERPNext, so
 *               the browser still talks to one origin and session cookies work.
 */
const TARGETS = {
	frappe: {
		base: "/assets/cw_pwa/frontend/",
		outDir: "../cw_pwa/public/frontend",
		appBase: "/cw",
		swUrl: "/cw/sw.js",
		icons: "/assets/cw_pwa/manifest",
	},
	standalone: {
		base: "/",
		outDir: "../dist",
		appBase: "",
		swUrl: "/sw.js",
		icons: "/manifest",
	},
	// The iOS / Android app (Capacitor). The files ship inside the app and talk to the
	// ERPNext site named by CW_SERVER with a device token; no service worker.
	native: {
		base: "/",
		outDir: "../dist-native",
		appBase: "",
		swUrl: "",
		icons: "/manifest",
		native: true,
	},
};

export default defineConfig(({ mode }) => {
	const target = TARGETS[mode] || TARGETS.frappe;
	const scope = target.appBase || "/";

	return {
		root: here,
		base: target.base,
		publicDir: false,
		define: {
			__APP_BASE__: JSON.stringify(target.appBase),
			__SW_URL__: JSON.stringify(target.swUrl),
			__ICONS__: JSON.stringify(target.icons),
			__APP_VERSION__: JSON.stringify(process.env.npm_package_version || "dev"),
			__NATIVE__: JSON.stringify(Boolean(target.native)),
			__NATIVE_SERVER__: JSON.stringify((process.env.CW_SERVER || "https://onespace.cw-eg.com").replace(/\/+$/, "")),
			// On only once a Firebase project is added (google-services.json): registering
			// for push without it crashes the Android app.
			__NATIVE_PUSH__: JSON.stringify(process.env.CW_NATIVE_PUSH === "1"),
		},
		plugins: [
			// Static template text is routed through $t() at compile time (see the plugin file).
			vue({ template: { compilerOptions: { nodeTransforms: [translateTemplateText] } } }),
			i18nExtract(path.resolve(here, "node_modules/.cw-i18n-strings.json")),
			{
				name: "cw-icons",
				transformIndexHtml: (html) => html.replaceAll("%ICONS%", target.icons),
				// The icons are committed once, in the Frappe app, where ERPNext serves them
				// from /assets. The standalone bundle has no such folder, so it carries a copy.
				generateBundle() {
					if (mode !== "standalone" && mode !== "native") return;
					const folder = path.resolve(here, "../cw_pwa/public/manifest");
					for (const file of fs.readdirSync(folder)) {
						this.emitFile({ type: "asset", fileName: `manifest/${file}`, source: fs.readFileSync(path.join(folder, file)) });
					}
				},
			},
			VitePWA({
				strategies: "injectManifest",
				srcDir: "src",
				filename: "sw.js",
				// Registered by src/lib/pwa.js, which owns the update lifecycle.
				injectRegister: false,
				devOptions: { enabled: false },
				injectManifest: {
					globPatterns: ["**/*.{js,css,html,woff2,png,svg}"],
					globIgnores: ["**/splash-*.png"],
					// Precache URLs must be absolute: the worker is served from the app
					// path, not from the folder its assets live in.
					modifyURLPrefix: { "": target.base },
				},
				manifest: {
					id: scope,
					name: "C-Water Visits",
					short_name: "CW Visits",
					description: "Site visits, inspections and service reports for C-Water field engineers.",
					start_url: scope,
					scope,
					display: "standalone",
					orientation: "portrait-primary",
					background_color: "#F3F7F9",
					theme_color: "#0097B2",
					lang: "en",
					dir: "ltr",
					categories: ["business", "productivity"],
					icons: [
						{ src: `${target.icons}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
						{ src: `${target.icons}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
						{ src: `${target.icons}/icon-192.maskable.png`, sizes: "192x192", type: "image/png", purpose: "maskable" },
						{ src: `${target.icons}/icon-512.maskable.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
					],
					shortcuts: [
						{
							name: "My visits",
							url: `${target.appBase}/visits`,
							icons: [{ src: `${target.icons}/icon-192.png`, sizes: "192x192" }],
						},
					],
				},
			}),
		],
		resolve: { alias: { "@": path.resolve(here, "src") } },
		server: {
			port: 8080,
			allowedHosts: true,
			proxy: {
				"^/(api|assets|files|private)": {
					target: `http://127.0.0.1:${benchPort()}`,
					ws: true,
					// Route by Host so a multi-site bench answers for the right site.
					router: (req) => `http://${(req.headers.host || "127.0.0.1").split(":")[0]}:${benchPort()}`,
				},
			},
		},
		build: {
			outDir: target.outDir,
			emptyOutDir: true,
			target: "es2020",
			sourcemap: false,
			chunkSizeWarningLimit: 400,
		},
	};
});

function benchPort() {
	let dir = here;
	for (let depth = 0; depth < 8; depth++) {
		const config = path.join(dir, "sites", "common_site_config.json");
		if (fs.existsSync(config)) {
			try {
				return JSON.parse(fs.readFileSync(config, "utf8")).webserver_port || 8000;
			} catch {
				return 8000;
			}
		}
		dir = path.resolve(dir, "..");
	}
	return 8000;
}
