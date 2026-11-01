// Full local verification run. Zero dependencies.
//   node tools/run-checks.mjs                                  unit tests + every headless check
//   node tools/run-checks.mjs j4 print                         only checks whose name matches
//   node tools/run-checks.mjs --evidence evidence/correction-20261015   write somewhere else
// Starts its own server on an OS-assigned free 127.0.0.1 port, confirms with
// lsof that its own PID owns that port, runs the headless-check skill
// (headless only, fresh profiles in a private TMPDIR), stops the server and
// verifies the port is closed and the private profiles are gone.
// Output: <evidence>/logs (raw logs, summary, ownership/closure), <evidence>/headless
// (run folders), <evidence>/print (PDFs). Exit code 0 only if everything passed.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HC = path.join(os.homedir(), '.claude/skills/headless-check/scripts/check.mjs');
const VIEWPORTS = '1440x900,1194x834,390x844';
const argv = process.argv.slice(2);
const evIdx = argv.indexOf('--evidence');
const EVIDENCE = path.resolve(ROOT, evIdx >= 0 ? argv[evIdx + 1] : 'evidence');
const filter = argv.filter((_, i) => !(evIdx >= 0 && (i === evIdx || i === evIdx + 1)));
const LOGS = path.join(EVIDENCE, 'logs');
const RUNS = path.join(EVIDENCE, 'headless');
const PRINT = path.join(EVIDENCE, 'print');
const TMP = path.join(ROOT, '.tmp', `hc-tmp-${Date.now()}`); // private TMPDIR for browser profiles
for (const d of [LOGS, RUNS, PRINT, TMP]) fs.mkdirSync(d, { recursive: true });

const CHECKS = [
  { name: 'load', args: ['--wait-for', '#app[data-ready="true"]'] },
  { name: 'load-reduced-motion', args: ['--wait-for', '#app[data-ready="true"]', '--reduced-motion'] },
  { name: 'j1-plan', script: 'checks/j1-plan.mjs' },
  { name: 'j2-rotation', script: 'checks/j2-rotation.mjs' },
  { name: 'j3-cards', script: 'checks/j3-cards.mjs' },
  { name: 'j4-clock', script: 'checks/j4-clock.mjs' },
  { name: 'j5-roundtrip', script: 'checks/j5-roundtrip.mjs' },
  { name: 'j6-edges', script: 'checks/j6-edges.mjs' },
  { name: 'j7-pilot', script: 'checks/j7-pilot.mjs' },
  { name: 'a11y', script: 'checks/a11y.mjs' },
  { name: 'print', script: 'checks/print.mjs', extra: ['--timeout', '30000', '--max-time', '400000'] },
  { name: 'correction-probes', script: 'checks/correction-probes.mjs', extra: ['--timeout', '30000', '--max-time', '400000'] },
  { name: 'fourup-fit', script: 'checks/fourup-fit.mjs', extra: ['--timeout', '30000', '--max-time', '400000'] },
  { name: 'c1-disruption', script: 'checks/c1-disruption.mjs', extra: ['--timeout', '30000', '--max-time', '400000'] },
  { name: 'debrief-export', script: 'checks/debrief-export.mjs', extra: ['--timeout', '30000', '--max-time', '400000'] },
  { name: 'c1-phone-usability', script: 'checks/c1-phone-usability.mjs', extra: ['--timeout', '30000', '--max-time', '400000'] },
  // Opt-in measurement, never part of a default run.
  { name: 'calibrate-fourup', script: 'checks/calibrate-fourup.mjs', optional: true },
].filter((c) => (filter.length ? filter.some((f) => c.name.includes(f)) : !c.optional));

const env = { ...process.env, TMPDIR: TMP, PWP_PRINT_DIR: PRINT };

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const t = setTimeout(() => reject(new Error(`server did not start: ${out}`)), 8000);
    child.stdout.on('data', (d) => {
      out += d;
      const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
      if (m) { clearTimeout(t); resolve({ child, port: Number(m[1]) }); }
    });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code) => { clearTimeout(t); reject(new Error(`server exited (${code}): ${out}`)); });
  });
}

const tag = filter.length ? `-${filter.join('-')}` : '';
const summary = { startedAt: new Date().toISOString(), node: process.version, viewports: VIEWPORTS, evidence: path.relative(ROOT, EVIDENCE), privateTmp: path.relative(ROOT, TMP), results: [] };
let failed = 0;

if (!filter.length) {
  const tests = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => `tests/${f}`);
  const unit = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...tests], { cwd: ROOT, encoding: 'utf8' });
  fs.writeFileSync(path.join(LOGS, 'unit-tests.log'), `$ node --test --test-reporter=spec ${tests.join(' ')}\n\n${unit.stdout}${unit.stderr}`);
  const pass = Number((unit.stdout.match(/ℹ pass (\d+)/) || [])[1] || 0);
  const fail = Number((unit.stdout.match(/ℹ fail (\d+)/) || [])[1] || 0);
  summary.unit = { exitCode: unit.status, pass, fail, command: 'node --test --test-reporter=spec tests/*.test.mjs' };
  console.log(`unit tests: ${pass} pass, ${fail} fail (exit ${unit.status})`);
  if (unit.status !== 0) failed++;
}

const { child, port } = await startServer();
summary.port = port;
summary.serverPid = child.pid;
// Ownership: the listener on this port must be our child process, on 127.0.0.1 only.
const own = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout;
fs.writeFileSync(path.join(LOGS, `server-ownership${tag}.log`), own);
const rows = own.trim().split('\n').slice(1);
summary.serverOwned = rows.length > 0 && rows.every((l) => Number(l.trim().split(/\s+/)[1]) === child.pid && l.includes(`127.0.0.1:${port}`));
console.log(`server: http://127.0.0.1:${port}/ (pid ${child.pid}, owned: ${summary.serverOwned})`);
try {
  if (!summary.serverOwned) throw new Error(`port ${port} is not owned by our server:\n${own}`);
  for (const c of CHECKS) {
    const url = `http://127.0.0.1:${port}/${c.script ? '?test#/plan' : ''}`;
    const args = [HC, url, '--viewports', VIEWPORTS, '--out', path.join(RUNS, c.name), '--json', '--timeout', '20000'];
    if (c.script) args.push('--wait-for', '#app[data-ready="true"]', '--script', c.script);
    args.push(...(c.args || []), ...(c.extra || []));
    const r = spawnSync(process.execPath, args, { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    fs.writeFileSync(path.join(LOGS, `headless-${c.name}.log`), `$ node ${args.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}\n\n${r.stdout}\n${r.stderr}`);
    let report = null;
    try { report = JSON.parse(r.stdout); } catch {}
    const vps = (report?.viewports || []).map((v) => ({
      viewport: v.name,
      consoleErrors: v.consoleErrors.length, exceptions: v.exceptions.length, failedRequests: v.failedRequests.length,
      httpErrors: v.httpErrors.length, blockedRequests: v.blockedRequests.length, scriptError: v.scriptError,
      title: v.title,
    }));
    const ok = r.status === 0 && vps.length === 3 && vps.every((v) => !v.scriptError);
    if (!ok) failed++;
    summary.results.push({ check: c.name, exitCode: r.status, ok, viewports: vps });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name} (exit ${r.status})${vps.filter((v) => v.scriptError).map((v) => ` ${v.viewport}: ${v.scriptError}`).join('')}`);
  }
} finally {
  child.kill('SIGTERM');
  await new Promise((res) => child.once('exit', res));
  const still = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout.trim();
  summary.serverStopped = !still;
  const pidAlive = spawnSync('kill', ['-0', String(child.pid)]).status === 0;
  summary.serverPidGone = !pidAlive;
  const leftovers = fs.readdirSync(TMP).filter((d) => d.startsWith('headless-check-profile-'));
  summary.privateProfilesLeft = leftovers;
  fs.writeFileSync(path.join(LOGS, `server-closure${tag}.log`), `port ${port} listening after stop: ${still || '(none)'}\npid ${child.pid} alive after stop: ${pidAlive}\nprivate TMPDIR ${path.relative(ROOT, TMP)} profiles left: ${leftovers.length ? leftovers.join(', ') : '(none)'}\n`);
  if (!leftovers.length) fs.rmSync(TMP, { recursive: true, force: true });
  summary.privateTmpRemoved = !fs.existsSync(TMP);
  console.log(`server stopped: ${!still}, pid gone: ${!pidAlive}, private profiles left: ${leftovers.length}`);
}
summary.finishedAt = new Date().toISOString();
summary.failed = failed;
fs.writeFileSync(path.join(LOGS, `headless-summary${tag}.json`), `${JSON.stringify(summary, null, 2)}\n`);
console.log(failed ? `${failed} check group(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
