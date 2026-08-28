// =============================================================================
// Find Tailwind classes the build did not generate.
//
//   npm run build && node scripts/check-classes.mjs
//
// Tailwind only emits a class it can literally find in the source. A typo, a
// class assembled from a variable, or an arbitrary value it declines to parse
// produces no rule at all — and a class with no rule looks exactly like a
// styling decision that did not work, with nothing failing anywhere to say so.
// This session lost two changes that way before the built CSS was checked.
//
// Only arbitrary classes are checked — the ones with brackets. Those are the
// ones Tailwind can refuse; the standard scale is either right or obviously
// wrong on screen.
// =============================================================================
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CSS_DIR = "dist/assets";
const SRC = "src";

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const cssFile = readdirSync(CSS_DIR).find(
  (n) => n.startsWith("index-") && n.endsWith(".css"),
);
if (!cssFile) {
  console.error("\nNo built stylesheet. Run `npm run build` first.\n");
  process.exit(1);
}
const css = readFileSync(join(CSS_DIR, cssFile), "utf8");

/** Tailwind escapes everything outside [A-Za-z0-9_-] with a backslash. */
const escape = (cls) => cls.replace(/[^A-Za-z0-9_-]/g, (c) => `\\${c}`);

const files = walk(SRC).filter((f) => /\.(tsx|ts)$/.test(f));
const missing = new Map();
let checked = 0;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  // Every quoted string that looks like a list of classes. Deliberately broad:
  // a false positive costs one lookup, a missed one costs a silent bug.
  for (const [, text] of source.matchAll(/["'`]([^"'`\n]*\[[^"'`\n]*)["'`]/g)) {
    for (const cls of text.split(/\s+/)) {
      if (!cls.includes("[") || !cls.includes("]")) continue;
      // Template holes and JS expressions are not classes.
      if (cls.includes("${") || cls.includes("(")) continue;
      // A real class either names a utility before its bracket (min-w-[680px],
      // sm:[&_td]:px-2) or is a bare child variant ([&_input]:h-7). Array
      // indexes and regex fragments — )[0], [01], ][ — do neither, and this is
      // scanning whole source files rather than only JSX.
      const named = /[a-z]/.test(cls.slice(0, cls.indexOf("[")));
      if (!named && !cls.startsWith("[&")) continue;
      checked += 1;
      if (css.includes(`.${escape(cls)}`)) continue;
      if (!missing.has(cls)) missing.set(cls, new Set());
      missing.get(cls).add(file.replace(/\\/g, "/"));
    }
  }
}

console.log(`\nChecked ${checked} arbitrary classes against ${cssFile}\n`);

if (missing.size === 0) {
  console.log("All generated.\n");
  process.exit(0);
}

for (const [cls, where] of [...missing].sort()) {
  console.log(`  ${cls}`);
  for (const file of where) console.log(`      ${file}`);
}
console.log(
  `\n${missing.size} class(es) with no rule in the stylesheet.\n` +
    `Each is doing nothing. Either it is a typo, or Tailwind would not parse it.\n`,
);
process.exit(1);
