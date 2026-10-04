/** @type {import('tailwindcss').Config} */
export default {
	content: ["./index.html", "./src/**/*.{vue,js}"],
	// Tone classes are chosen at runtime from a status (`tone-${tone}`), so the
	// scanner never sees them written out in full.
	safelist: ["tone-ok", "tone-warn", "tone-bad", "tone-info", "tone-review", "tone-brand", "tone-muted"],
	theme: {
		extend: {
			// Every colour is a semantic token defined in src/style.css, so light and
			// dark themes swap in one place and components never hold raw hex values.
			colors: {
				bg: "var(--bg)",
				surface: "var(--surface)",
				sunken: "var(--sunken)",
				ink: "var(--ink)",
				"ink-2": "var(--ink-2)",
				"ink-3": "var(--ink-3)",
				line: "var(--line)",
				brand: "var(--brand)",
				"brand-strong": "var(--brand-strong)",
				"brand-soft": "var(--brand-soft)",
				"on-brand": "var(--on-brand)",
				hero: "var(--hero)",
				"on-hero": "var(--on-hero)",
				ok: "var(--ok)",
				"ok-soft": "var(--ok-soft)",
				warn: "var(--warn)",
				"warn-soft": "var(--warn-soft)",
				bad: "var(--bad)",
				"bad-soft": "var(--bad-soft)",
				info: "var(--info)",
				"info-soft": "var(--info-soft)",
				review: "var(--review)",
				"review-soft": "var(--review-soft)",
			},
			fontFamily: {
				sans: [
					"-apple-system",
					"BlinkMacSystemFont",
					'"SF Pro Text"',
					'"Segoe UI"',
					"Roboto",
					'"Noto Sans"',
					'"Noto Sans Arabic"',
					"sans-serif",
				],
			},
			borderRadius: { card: "18px", control: "14px" },
			boxShadow: {
				card: "0 1px 2px rgb(14 36 48 / 0.05), 0 6px 20px -12px rgb(14 36 48 / 0.18)",
				bar: "0 -1px 0 var(--line), 0 -10px 30px -18px rgb(14 36 48 / 0.25)",
				fab: "0 10px 24px -8px rgb(0 122 145 / 0.6)",
			},
			spacing: {
				"safe-top": "env(safe-area-inset-top, 0px)",
				"safe-bottom": "env(safe-area-inset-bottom, 0px)",
				"safe-left": "env(safe-area-inset-left, 0px)",
				"safe-right": "env(safe-area-inset-right, 0px)",
			},
			screens: { standalone: { raw: "(display-mode: standalone)" } },
		},
	},
	plugins: [],
};
