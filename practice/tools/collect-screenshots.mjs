// Copies a curated, named set of screenshots from the latest check run
// (<evidence>/headless/<check>/<run>/) into <evidence>/screenshots/.
// Run after: node tools/run-checks.mjs [--evidence DIR]
//   node tools/collect-screenshots.mjs [--evidence DIR]   (default: evidence)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const evIdx = process.argv.indexOf('--evidence');
const EVIDENCE = path.resolve(ROOT, evIdx >= 0 ? process.argv[evIdx + 1] : 'evidence');
const RUNS = path.join(EVIDENCE, 'headless');
const OUT = path.join(EVIDENCE, 'screenshots');
const latest = (check) => {
  const dir = path.join(RUNS, check);
  const runs = fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()).sort();
  return path.join(dir, runs[runs.length - 1]);
};
const PICKS = [
  ['j1-plan', '1440x900-j1-week-day-editing', '01-week-and-day-editing-desktop'],
  ['j1-plan', '1194x834-j1-day-script', '02-day-script-totals-ipad'],
  ['j1-plan', '390x844-j1-day-script', '03-day-script-phone'],
  ['j2-rotation', '1194x834-j2-rotation-warnings', '04-rotation-shortage-warnings-ipad'],
  ['j2-rotation', '1194x834-j2-rotation-locked', '05-rotation-locked-slot-ipad'],
  ['j2-rotation', '390x844-j2-rotation-locked', '06-rotation-phone'],
  ['j3-cards', '1194x834-j3-card-editor', '07-card-editor-ipad'],
  ['j3-cards', '390x844-j3-card-editor', '08-card-editor-phone'],
  ['j4-clock', '1194x834-j4-clock-running', '09-clock-coach-view-ipad'],
  ['j4-clock', '390x844-j4-clock-running', '10-clock-phone'],
  ['j4-clock', '1194x834-j4-assistant', '11-clock-assistant-view-ipad'],
  ['j4-clock', '1194x834-j4-clock-recovered', '12-clock-recovered-after-reload-ipad'],
  ['j4-clock', '390x844-j4-clock-recovered', '13-clock-recovered-phone'],
  ['j4-clock', '1440x900-j4-completed', '14-clock-completed-summary-desktop'],
  ['j5-roundtrip', '1194x834-j5-data', '15-save-export-import-ipad'],
  ['j6-edges', '1194x834-j6-hostile-long-text', '16-hostile-long-text-ipad'],
  ['j6-edges', '390x844-j6-storage-error', '17-storage-error-phone'],
  ['j6-edges', '1194x834-j6-read-only-follow', '18-competing-tab-read-only-ipad'],
  ['j6-edges', '390x844-j6-read-only-follow', '19-competing-tab-read-only-phone'],
  ['j6-edges', '1194x834-j6-conflict', '20-revision-conflict-ipad'],
  ['j6-edges', '1194x834-j6-unreadable-saved-data', '21-unreadable-saved-data-ipad'],
  ['j6-edges', '390x844-j6-empty-day', '22-empty-day-phone'],
  ['load-reduced-motion', '1194x834-reduced-motion', '23-first-load-reduced-motion-ipad'],
  ['load', '390x844', '24-first-load-phone'],
  ['print', '1440x900-print-week-summary', '25-print-week-summary'],
  ['print', '1440x900-print-script-monday', '26-print-coach-script-monday'],
  ['print', '1440x900-print-rotation-wednesday', '27-print-rotation-sheet-shortage'],
  ['print', '1440x900-print-cards-all', '28-print-cards-4-per-page'],
  ['print', '1440x900-print-card-stress', '29-print-max-length-card'],
  ['print', '1440x900-print-script-stress-day-long-text-', '30-print-long-notes-script'],
  ['j3-cards', '1194x834-j3-card-print', '31-print-single-card-preview-ipad'],
  // Correction 2026-10-15 (independent review findings F1-F3).
  ['correction-probes', '1440x900-f1-reset-rebuilt', '32-f1-reset-rebuilt-desktop'],
  ['correction-probes', '1194x834-f1-reset-rebuilt', '33-f1-reset-rebuilt-ipad'],
  ['correction-probes', '390x844-f1-reset-rebuilt', '34-f1-reset-rebuilt-phone'],
  ['correction-probes', '1194x834-f2-multiline-refused', '35-f2-80-line-card-refused-ipad'],
  ['correction-probes', '1440x900-f2-boundary-print', '36-f2-21-line-card-four-up-print'],
  ['correction-probes', '1440x900-f2-legacy-solo-print', '37-f2-older-80-line-card-own-page-print'],
  ['correction-probes', '1194x834-f3-malformed-refused', '38-f3-malformed-history-refused-ipad'],
  ['correction-probes', '390x844-f3-malformed-refused', '39-f3-malformed-history-refused-phone'],
  ['correction-probes', '1194x834-f3-damaged-clock-set-aside', '40-f3-damaged-saved-clock-set-aside-ipad'],
  ['print', '1440x900-print-card-ml-blank', '41-print-blank-line-card-at-limit'],
  ['print', '1440x900-print-cards-10', '42-print-10-cards-four-up'],
  ['fourup-fit', '1194x834-fourup-W-refused-in-editor', '43-whole-card-too-tall-refused-ipad'],
  ['fourup-fit', '390x844-fourup-W-refused-in-editor', '44-whole-card-too-tall-refused-phone'],
  ['fourup-fit', '1440x900-fourup-realistic-max', '45-realistic-max-cards-four-up-print'],
  ['fourup-fit', '1440x900-fourup-near-boundary', '46-near-boundary-cards-four-up-print'],
  ['fourup-fit', '1194x834-fourup-duplicate-refused', '47-duplicate-refused-ipad'],
  ['c1-disruption', '1194x834-c1-late-notice', '48-c1-late-notice-ipad'],
  ['c1-disruption', '1194x834-c1-rebalance-preview', '49-c1-rebalance-preview-ipad'],
  ['c1-disruption', '390x844-c1-rebalance-preview', '50-c1-rebalance-preview-phone'],
  ['c1-disruption', '1194x834-c1-station-panel', '51-c1-station-unavailable-ipad'],
  ['c1-disruption', '1440x900-c1-debrief-saved', '52-c1-debrief-and-handoff-desktop'],
  ['c1-disruption', '1194x834-c1-reopened', '53-c1-reopened-debrief-ipad'],
].filter(([check]) => fs.existsSync(path.join(RUNS, check)));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const missing = [];
for (const [check, stem, name] of PICKS) {
  const src = path.join(latest(check), `${stem}.png`);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, `${name}.png`));
  else missing.push(path.relative(ROOT, src));
}
console.log(`copied ${PICKS.length - missing.length}/${PICKS.length}${missing.length ? `; missing: ${missing.join(', ')}` : ''}`);
process.exit(missing.length ? 1 : 0);
