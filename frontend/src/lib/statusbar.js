/**
 * The iPhone status bar takes the colour of the app's top bar, so the two read as one
 * surface.
 *
 * index.html carries a light and a dark theme-color with `media` queries, for the
 * launch screen. A Home Screen app on iOS does not reliably apply media-qualified
 * theme colours: it then falls back to a blurred strip over the page, which shows as a
 * grey haze above the header. Once the app is running, a single theme-color with the
 * header's exact colour replaces them (the approach of the Nest ESS app).
 */

function headerColour() {
	const value = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();
	return value || (matchMedia("(prefers-color-scheme: dark)").matches ? "#13272f" : "#ffffff");
}

export function applyStatusBar() {
	const colour = headerColour();
	const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
	if (!metas.length) {
		const meta = document.createElement("meta");
		meta.name = "theme-color";
		document.head.appendChild(meta);
		metas.push(meta);
	}
	for (const meta of metas) {
		meta.removeAttribute("media");
		meta.setAttribute("content", colour);
	}
}

export function followStatusBar() {
	applyStatusBar();
	matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyStatusBar);
}
