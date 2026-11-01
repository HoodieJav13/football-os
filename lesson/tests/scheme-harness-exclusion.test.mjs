// The Teaching harness is development-only. Run after `npm run build`; the dist scan is
// skipped, visibly, when no build output exists.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import test from 'node:test';

const dist = new URL('../dist/', import.meta.url);
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const entry = new URL(name, dir);
  return statSync(entry).isDirectory() ? walk(new URL(`${name}/`, dir)) : [entry];
});

test('the only link to the harness is gated on the development build', () => {
  const source = read('../src/SchemePackagePanel.jsx');
  const line = source.split('\n').find((item) => item.includes('teaching-harness'));
  assert.match(line, /import\.meta\.env\.DEV/);
});

test('production views import no development harness or Firebase adapter', () => {
  for (const file of ['../src/App.jsx', '../src/SchemePackagePanel.jsx', '../src/schemeLesson.js', '../src/schemePackage.js', '../src/schemeDemo.js', '../src/main.jsx', '../src/CoachReview.jsx', '../src/coachReview.js']) {
    assert.doesNotMatch(read(file), /from ['"][^'"]*(dev\/|firebase)/i, file);
  }
});

test('the development harness UI is absent from production output', { skip: !existsSync(dist) && 'no dist directory; run npm run build first' }, () => {
  const files = walk(dist);
  assert.ok(files.length > 0);
  for (const file of files) {
    assert.doesNotMatch(file.pathname, /teaching-harness|teachingHarness/);
    if (/\.(html|js|css|json|webmanifest)$/.test(file.pathname)) {
      assert.doesNotMatch(readFileSync(file, 'utf8'), /teaching-harness|data-harness=|Local Teaching harness/, file.pathname);
    }
  }
});
