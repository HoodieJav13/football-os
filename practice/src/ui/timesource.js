// Time sources for the browser. Elapsed time always comes from mono().
// `?test` in the URL swaps in a controllable fake clock for headless checks;
// it is not part of the coach workflow and has no visible control.
const params = new URLSearchParams(globalThis.location ? location.search : '');
export const TEST_MODE = params.has('test');

let fakeMono = 0; // like performance.now(): restarts at 0 on every page load
let wallOffset = 0; // like the device clock: survives a reload
if (TEST_MODE) {
  try { wallOffset = Number(sessionStorage.getItem('pwp:test:wallOffset')) || 0; } catch { wallOffset = 0; }
}
const keepOffset = () => { try { sessionStorage.setItem('pwp:test:wallOffset', String(wallOffset)); } catch {} };

export function mono() {
  return TEST_MODE ? fakeMono : performance.now();
}

export function wall() {
  return Date.now() + (TEST_MODE ? wallOffset : 0);
}

if (TEST_MODE) {
  globalThis.__pwpClock = {
    // Time passing: both clocks move together.
    advance(ms) { fakeMono += ms; wallOffset += ms; keepOffset(); return fakeMono; },
    // A wall-clock change or device sleep: only the wall clock moves.
    shiftWall(ms) { wallOffset += ms; keepOffset(); return wallOffset; },
    get() { return { mono: fakeMono, wall: wall() }; },
  };
}
