// SHA-256 manifest of the deliverable and its saved evidence.
//   node tools/manifest.mjs [--out evidence/X.sha256]          write
//   node tools/manifest.mjs --verify [--out evidence/X.sha256] re-hash every entry
// Excluded: .git, .tmp/ (scratch and transient browser profiles), .tmp-* files
// (an earlier session's server log/pid), .DS_Store, node_modules, the manifest
// itself, and files named with --exclude (written after the manifest).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
if (!args.includes('--out')) {
  // No default on purpose: evidence/MANIFEST.sha256 is the reviewed, historical manifest.
  console.error('usage: node tools/manifest.mjs --out evidence/<name>.sha256 [--exclude FILE ...] [--verify]');
  process.exit(2);
}
const OUT = path.resolve(ROOT, opt('--out'));
const EXTRA = args.flatMap((a, i) => (a === '--exclude' ? [path.resolve(ROOT, args[i + 1])] : []));
const SKIP = new Set(['.git', '.tmp', 'node_modules', '.DS_Store', '.superpowers']);
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

if (args.includes('--verify')) {
  const lines = fs.readFileSync(OUT, 'utf8').trim().split('\n');
  let bad = 0;
  for (const line of lines) {
    const [hash, rel] = [line.slice(0, 64), line.slice(66)];
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) { bad++; console.log(`MISSING ${rel}`); continue; }
    if (sha(f) !== hash) { bad++; console.log(`CHANGED ${rel}`); }
  }
  console.log(`${lines.length} entries checked, ${bad} problem(s) — ${bad ? 'FAILED' : 'all match'}`);
  process.exit(bad ? 1 : 0);
}

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('.tmp-')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (p !== OUT && !EXTRA.includes(p)) files.push(p);
  }
})(ROOT);
files.sort();
fs.writeFileSync(OUT, `${files.map((f) => `${sha(f)}  ${path.relative(ROOT, f)}`).join('\n')}\n`);
console.log(`${files.length} files hashed -> ${path.relative(ROOT, OUT)}`);
