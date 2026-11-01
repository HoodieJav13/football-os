// Shared test helpers: tiny hand-built days, groups and participants.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const loadLibrary = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'content/library.json'), 'utf8'));

// Deterministic id factory for tests: t-1, t-2, ...
export function seqIds(prefix = 't') {
  let n = 0;
  return (kind = prefix) => `${kind}-${++n}`;
}

export function period(id, minutes, extra = {}) {
  return {
    id,
    title: `Period ${id}`,
    minutes,
    category: 'group',
    objective: '',
    callLabel: '',
    drillId: null,
    cardIds: [],
    groupIds: [],
    equipment: [],
    notes: '',
    scheduled: true,
    parallel: false,
    fixedStart: null,
    ...extra,
  };
}

export function day(id, periods, extra = {}) {
  return { id, label: `Day ${id}`, date: '', startMin: 15 * 60 + 30, plannedMinutes: 120, version: 1, notes: '', periods, ...extra };
}

export function week(days, extra = {}) {
  return { id: 'wk-1', version: 1, opponentLabel: 'Fictional Opponent', notes: '', days, ...extra };
}

export const G1 = { id: 'g1', label: 'Scout Group 1', roles: [{ slotId: 'g1-qb', roleKey: 'QB', label: 'QB' }, { slotId: 'g1-wr', roleKey: 'WR', label: 'WR' }] };
export const G2 = { id: 'g2', label: 'Scout Group 2', roles: [{ slotId: 'g2-wr', roleKey: 'WR', label: 'WR' }] };

export function person(id, roleKeys, groupIds = ['g1'], extra = {}) {
  return { id, label: `Fict Scout ${id}`, roleKeys, groupIds, unavailable: [], ...extra };
}

export const env = (mono, extra = {}) => ({ mono, wall: 1_800_000_000_000 + mono, instanceId: 'inst-A', ...extra });

export function slotOf(rotation, periodId, slotId) {
  for (const e of rotation.entries) {
    if (e.periodId !== periodId) continue;
    const s = e.slots.find((x) => x.slotId === slotId);
    if (s) return s;
  }
  return undefined;
}
