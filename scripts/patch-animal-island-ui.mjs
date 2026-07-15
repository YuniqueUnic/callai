/**
 * animal-island-ui@1.2.1 Drawer sets `inert: ""` which React 19 warns about.
 * Patch to boolean `true` after install.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const roots = [
  join("node_modules", "animal-island-ui", "dist", "es", "components", "Drawer", "Drawer.js"),
  join("node_modules", "animal-island-ui", "dist", "cjs", "components", "Drawer", "Drawer.cjs"),
];

let n = 0;
for (const file of roots) {
  if (!existsSync(file)) continue;
  let t = readFileSync(file, "utf8");
  const next = t
    .replaceAll('{ inert: "" }', "{ inert: true }")
    .replaceAll('{inert:""}', "{inert:true}")
    .replaceAll('inert: ""', "inert: true")
    .replaceAll('inert:""', "inert:true");
  if (next !== t) {
    writeFileSync(file, next);
    n += 1;
    console.log(`patched ${file}`);
  }
}
if (n === 0) console.log("animal-island-ui: no inert patch needed (or package missing)");
