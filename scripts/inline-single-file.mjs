import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Packs the built app into one self-contained HTML page.
 *
 * Written for sharing a clickable build with someone who should not have to
 * install anything: no server, no relative asset requests, nothing fetched at
 * runtime. That constraint is exactly the one a strict CSP imposes, so the same
 * output works as an Artifact.
 *
 *   node scripts/inline-single-file.mjs <output.html>
 */

const dist = new URL("../dist/client/", import.meta.url);
const assets = path.join(dist.pathname, "assets");
const out = process.argv[2];
if (!out) {
  console.error("usage: node scripts/inline-single-file.mjs <output.html>");
  process.exit(2);
}

const files = readdirSync(assets);
const pick = (test) => {
  const hit = files.find(test);
  if (!hit) throw new Error(`No built asset matched in ${assets}`);
  return path.join(assets, hit);
};

let css = readFileSync(pick((f) => f.endsWith(".css")), "utf8");
const js = readFileSync(pick((f) => f.endsWith(".js")), "utf8");

/*
 * Fonts become data URIs. The stylesheet keeps its unicode-range rules, so the
 * browser still only decodes the subsets it needs -- inlining changes where the
 * bytes come from, not when they are used.
 */
let fontCount = 0;
css = css.replace(/url\(\s*["']?\/assets\/([^)"']+\.woff2)["']?\s*\)/g, (whole, name) => {
  const file = path.join(assets, name);
  try {
    fontCount += 1;
    return `url("data:font/woff2;base64,${readFileSync(file).toString("base64")}")`;
  } catch {
    console.warn(`  ! could not inline ${name}, leaving the reference alone`);
    return whole;
  }
});

/*
 * The page is written as a fragment -- no doctype, html, head or body -- because
 * the Artifact host supplies those. Served from a file it still renders: every
 * browser infers the missing structure.
 *
 * `</script` inside the bundle would close the tag early, so it is escaped. The
 * sequence is inert to the JS parser, which reads `<\/` as a plain slash.
 */
/*
 * Offline caching is switched off, honestly rather than silently.
 *
 * A single file has no `/sw.js` to register, and a sandboxed host blocks
 * service workers outright, so the attempt hangs and the header sits on
 * "Preparing offline" forever -- describing work that will never finish.
 * Removing the capability makes the app take its own no-service-worker path
 * and report "Local workspace", which is what this build actually is.
 */
const disableOfflineCaching = `<script>
  try { delete Navigator.prototype.serviceWorker; } catch (error) { /* older engine: leave it */ }
</script>`;

/*
 * The charset declaration comes first and nothing large may precede it.
 * A browser only honours `<meta charset>` inside the first 1024 bytes of the
 * document, so putting it after the inlined stylesheet is the same as omitting
 * it -- the page then falls back to Latin-1 and every en dash and middot in the
 * play data renders as mojibake ("Air Raid Offense a**" Passing Plays").
 */
const page = `<meta charset="utf-8" />
<title>Football OS</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
${disableOfflineCaching}
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js.replace(/<\/script/gi, "<\\/script")}
</script>
`;

writeFileSync(out, page);
const kb = (n) => `${Math.round(n / 1024)} kB`;
console.log(`Wrote ${out}`);
console.log(`  css ${kb(css.length)} (${fontCount} fonts inlined) · js ${kb(js.length)} · total ${kb(page.length)}`);
