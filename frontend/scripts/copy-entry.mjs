// Copies the built index.html to cw_pwa/www/cw.html, the page ERPNext serves at /cw.
// A Node script instead of `cp` so the build also works on Windows.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../cw_pwa/public/frontend/index.html");
const destination = resolve(here, "../../cw_pwa/www/cw.html");

if (!existsSync(source)) {
	console.error(`Build output not found: ${source}`);
	process.exit(1);
}
mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
console.log(`copied index.html -> ${destination}`);
