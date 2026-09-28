import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
for (const path of ["practice/javascript/tickets.mjs", "practice/javascript/tickets.test.mjs"]) {
  if (!existsSync(join(root, path))) throw new Error(`Missing workshop file: ${path}`);
}
console.log(`Node ${process.version}: OK`);
console.log("Workshop files: OK");
