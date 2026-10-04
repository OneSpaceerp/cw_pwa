/**
 * Makes the text in Vue templates translatable at compile time.
 *
 * Static text and attributes:
 *   <button aria-label="Refresh">Sync now</button>
 * compile as if written
 *   <button :aria-label="$t('Refresh')">{{ $t('Sync now') }}</button>
 *
 * Dynamic text and attributes are passed through $t() as well:
 *   {{ status.label }}            ->  {{ $t(status.label) }}
 *   :title="busy ? 'Saving' : 'Save'"  ->  :title="$t(busy ? 'Saving' : 'Save')"
 * $t() looks the value up as a whole. A status, an option or a button label has a
 * translation; a customer name or a number does not and is shown unchanged.
 *
 * English is the key, so templates stay readable and anything untranslated simply
 * appears in English. Only sentences with a value inside them need an explicit
 * t("... {name} ...", { name }) in the code.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const ELEMENT = 1;
const TEXT = 2;
const SIMPLE_EXPRESSION = 4;
const INTERPOLATION = 5;
const ATTRIBUTE = 6;
const DIRECTIVE = 7;
const COMPOUND_EXPRESSION = 8;

// Attributes and component props whose value is text a person reads.
const TEXT_ATTRIBUTES = new Set([
	"placeholder",
	"aria-label",
	"title",
	"alt",
	"label",
	"subtitle",
	"text",
	"heading",
	"noun",
	"empty-text",
	"confirm-label",
]);
const HAS_WORD = /[A-Za-z]{2}/;
const DONE = Symbol("cw-i18n");

export const extracted = new Set();

const simple = (content, loc) => ({ type: SIMPLE_EXPRESSION, content, isStatic: false, constType: 0, loc });

/** Wrap an already-compiled expression: $t(<expression>). `_ctx` exists in every render function. */
const wrapped = (inner, loc) => ({ type: COMPOUND_EXPRESSION, children: ["_ctx.$t(", inner, ")"], loc });

export function translateTemplateText(node) {
	if (node.type === ELEMENT) {
		node.props = node.props.map((prop) => {
			if (prop.type === ATTRIBUTE && TEXT_ATTRIBUTES.has(prop.name)) {
				const text = prop.value?.content;
				if (!text || !HAS_WORD.test(text)) return prop;
				extracted.add(text);
				return {
					type: DIRECTIVE,
					name: "bind",
					rawName: `:${prop.name}`,
					arg: { type: SIMPLE_EXPRESSION, content: prop.name, isStatic: true, constType: 3, loc: prop.loc },
					exp: simple(`_ctx.$t(${JSON.stringify(text)})`, prop.loc),
					modifiers: [],
					loc: prop.loc,
					[DONE]: true,
				};
			}
			if (
				prop.type === DIRECTIVE &&
				prop.name === "bind" &&
				!prop[DONE] &&
				prop.exp &&
				prop.arg?.isStatic &&
				TEXT_ATTRIBUTES.has(prop.arg.content)
			) {
				prop.exp = wrapped(prop.exp, prop.loc);
				prop[DONE] = true;
			}
			return prop;
		});
		return;
	}

	if (node.type === INTERPOLATION && !node[DONE]) {
		node.content = wrapped(node.content, node.loc);
		node[DONE] = true;
		return;
	}

	if (node.type === TEXT && HAS_WORD.test(node.content)) {
		const [, lead, core, trail] = node.content.match(/^(\s*)([\s\S]*?)(\s*)$/);
		const key = core.replace(/\s+/g, " ");
		extracted.add(key);

		// Keep the spaces that separate this text from its neighbours.
		let code = `_ctx.$t(${JSON.stringify(key)})`;
		if (lead) code = `" " + ${code}`;
		if (trail) code = `${code} + " "`;

		node.type = INTERPOLATION;
		node.content = simple(code, node.loc);
		node[DONE] = true;
	}
}

/** Vite plugin: writes the strings found in templates where the checker script reads them. */
export function i18nExtract(outFile) {
	return {
		name: "cw-i18n-extract",
		closeBundle() {
			mkdirSync(dirname(outFile), { recursive: true });
			writeFileSync(outFile, JSON.stringify([...extracted].sort(), null, 1));
		},
	};
}
