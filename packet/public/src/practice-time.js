// Wall-time and duration formatting. Pure.
// Schedule times are minutes after local midnight in the project's one
// explicit timezone. Elapsed clock time is milliseconds from a monotonic
// source and is formatted separately (formatCountdown / formatElapsed).

const pad = (n) => String(n).padStart(2, '0');

export function parseHHMM(text) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(text ?? ''));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatHHMM(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function formatClock12(minutes) {
  const dayOffset = Math.floor(minutes / 1440);
  const m = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const base = `${h12}:${pad(m % 60)} ${suffix}`;
  return dayOffset > 0 ? `${base} +${dayOffset}d` : base;
}

function hms(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// Remaining time: ceil while time remains, "+over" (floored) once overrun.
export function formatCountdown(remainingMs) {
  if (remainingMs >= 0) return { text: hms(Math.ceil(remainingMs / 1000)), overrun: false };
  return { text: `+${hms(Math.floor(-remainingMs / 1000))}`, overrun: true };
}

export function formatElapsed(ms) {
  return hms(Math.max(0, Math.floor(ms / 1000)));
}

export function formatMinutes(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
