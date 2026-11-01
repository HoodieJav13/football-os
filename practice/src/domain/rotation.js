// Scout rotation: generate, validate, manual assign, lock. Pure and deterministic.
//
// Slot      = scheduled period × group in that period × role slot of that group.
// Candidate = holds the slot's role key, belongs to the group, is available for
//             the period, and is not assigned to any slot whose period interval
//             overlaps this one (same period or a parallel station).
// Fairness  = fewest assignments so far that day (locks counted first), then
//             fewest times in this role key, then lowest seeded rank. Stated in
//             DATA-FORMAT.md. It is a planning count, not a workload measure.
import { computeSchedule, intervalsOverlap } from './week.js';
import { isUnavailable } from './participants.js';
import { seededRank } from './rng.js';

export const FAIRNESS_RULE = 'fewest-day-total > fewest-same-role > seeded-rank';

const keyOf = (s) => `${s.periodId}|${s.groupId}|${s.slotId}`;

function buildContext({ day, groups, participants }) {
  const schedule = computeSchedule(day);
  const periodById = new Map(day.periods.map((p) => [p.id, p]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const personById = new Map(participants.map((p) => [p.id, p]));
  const ordered = schedule.items.map((it, idx) => ({ ...it, idx })).sort((a, b) => a.startMin - b.startMin || a.idx - b.idx);
  const slots = [];
  const unknownGroups = [];
  for (const it of ordered) {
    const p = periodById.get(it.periodId);
    for (const gid of p.groupIds) {
      const g = groupById.get(gid);
      if (!g) {
        unknownGroups.push({ periodId: p.id, groupId: gid });
        continue;
      }
      for (const role of g.roles) {
        slots.push({ periodId: p.id, groupId: gid, slotId: role.slotId, roleKey: role.roleKey, roleLabel: role.label, startMin: it.startMin, endMin: it.endMin, order: slots.length });
      }
    }
  }
  const slotByKey = new Map(slots.map((s) => [keyOf(s), s]));
  return { day, schedule, periodById, groupById, personById, participants, slots, slotByKey, unknownGroups };
}

const periodTitle = (ctx, id) => ctx.periodById.get(id)?.title ?? id;
const groupLabel = (ctx, id) => ctx.groupById.get(id)?.label ?? id;
const personLabel = (ctx, id) => ctx.personById.get(id)?.label ?? id;

// assignments: Map slotKey -> { participantId, locked, ... }
function busyElsewhere(ctx, assignments, slot, pid) {
  for (const other of ctx.slots) {
    if (other === slot) continue;
    const a = assignments.get(keyOf(other));
    if (!a || a.participantId !== pid) continue;
    if (other.periodId === slot.periodId || intervalsOverlap(other, slot)) return other;
  }
  return null;
}

function reasonsFor(ctx, assignments, slot, p) {
  const reasons = [];
  if (!p.roleKeys.includes(slot.roleKey)) reasons.push(`not eligible for ${slot.roleKey}`);
  if (!p.groupIds.includes(slot.groupId)) reasons.push(`not in ${groupLabel(ctx, slot.groupId)}`);
  if (isUnavailable(p, ctx.day.id, slot.periodId)) reasons.push('unavailable for this period');
  const busy = busyElsewhere(ctx, assignments, slot, p.id);
  if (busy) reasons.push(`already assigned at the same time in “${periodTitle(ctx, busy.periodId)}” (${groupLabel(ctx, busy.groupId)} ${busy.roleLabel || busy.roleKey})`);
  return reasons;
}

function shortageReason(ctx, assignments, slot) {
  const holders = ctx.participants.filter((p) => p.roleKeys.includes(slot.roleKey) && p.groupIds.includes(slot.groupId));
  if (!holders.length) return `No participant in ${groupLabel(ctx, slot.groupId)} is eligible for ${slot.roleKey}.`;
  const parts = holders.map((p) => `${p.label}: ${reasonsFor(ctx, assignments, slot, p).join(', ') || 'free'}`);
  return `No one free for ${slot.roleKey}. ${holders.length} eligible in ${groupLabel(ctx, slot.groupId)} — ${parts.join('; ')}.`;
}

function emptyCounts(participants) {
  return Object.fromEntries(participants.map((p) => [p.id, { total: 0, byRole: {} }]));
}

function bump(counts, pid, roleKey) {
  if (!counts[pid]) return;
  counts[pid].total += 1;
  counts[pid].byRole[roleKey] = (counts[pid].byRole[roleKey] || 0) + 1;
}

function previousMap(previous) {
  const m = new Map();
  if (!previous) return m;
  for (const e of previous.entries || []) for (const s of e.slots) m.set(keyOf({ periodId: e.periodId, groupId: e.groupId, slotId: s.slotId }), s);
  return m;
}

function toEntries(ctx, assignments) {
  const entries = [];
  const byPair = new Map();
  for (const s of ctx.slots) {
    const pair = `${s.periodId}|${s.groupId}`;
    let e = byPair.get(pair);
    if (!e) {
      e = { periodId: s.periodId, groupId: s.groupId, slots: [] };
      byPair.set(pair, e);
      entries.push(e);
    }
    const a = assignments.get(keyOf(s)) || { participantId: null, locked: false, reason: 'Not generated yet.', rationale: '' };
    e.slots.push({ slotId: s.slotId, roleKey: s.roleKey, participantId: a.participantId, locked: !!a.locked, reason: a.reason || '', rationale: a.rationale || '' });
  }
  return entries;
}

function assignmentsFrom(rotation) {
  const m = new Map();
  for (const e of rotation?.entries || []) for (const s of e.slots) m.set(keyOf({ periodId: e.periodId, groupId: e.groupId, slotId: s.slotId }), { ...s });
  return m;
}

function finish(ctx, rotation) {
  const v = validateWith(ctx, rotation);
  return { ...rotation, warnings: v.warnings, counts: v.counts };
}

// ---------------------------------------------------------------- generate
export function generateRotation({ day, groups, participants, previous = null, seed = 1 }) {
  const ctx = buildContext({ day, groups, participants });
  const prev = previousMap(previous);
  // Locks parked as orphans come back when their slot exists again.
  for (const o of previous?.orphans || []) {
    if (o.locked && o.participantId && !prev.has(keyOf(o))) prev.set(keyOf(o), { slotId: o.slotId, roleKey: o.roleKey, participantId: o.participantId, locked: true });
  }
  const assignments = new Map();
  const counts = emptyCounts(participants);
  let lockedCount = 0;

  // 1. Locks first; never changed, even when no longer valid.
  for (const s of ctx.slots) {
    const p = prev.get(keyOf(s));
    if (p && p.locked && p.participantId) {
      assignments.set(keyOf(s), { participantId: p.participantId, locked: true, reason: '', rationale: 'Locked by coach.' });
      bump(counts, p.participantId, s.roleKey);
      lockedCount++;
    }
  }

  // Locked slots whose period/group/role no longer exists are kept, not applied.
  const orphans = [];
  if (previous) {
    for (const e of previous.entries || []) {
      for (const s of e.slots) {
        if (s.locked && s.participantId && !ctx.slotByKey.has(keyOf({ periodId: e.periodId, groupId: e.groupId, slotId: s.slotId }))) {
          orphans.push({ periodId: e.periodId, groupId: e.groupId, slotId: s.slotId, roleKey: s.roleKey, participantId: s.participantId, locked: true });
        }
      }
    }
    for (const o of previous.orphans || []) if (!orphans.some((x) => keyOf(x) === keyOf(o)) && !ctx.slotByKey.has(keyOf(o))) orphans.push(o);
  }

  // 2. Fill the rest in schedule order.
  for (const s of ctx.slots) {
    if (assignments.has(keyOf(s))) continue;
    const valid = participants.filter((p) => reasonsFor(ctx, assignments, s, p).length === 0);
    if (!valid.length) {
      assignments.set(keyOf(s), { participantId: null, locked: false, reason: shortageReason(ctx, assignments, s), rationale: '' });
      continue;
    }
    const scored = valid
      .map((p) => ({ p, total: counts[p.id].total, role: counts[p.id].byRole[s.roleKey] || 0, rank: seededRank(seed, p.id) }))
      .sort((a, b) => a.total - b.total || a.role - b.role || a.rank - b.rank || (a.p.id < b.p.id ? -1 : 1));
    const best = scored[0];
    const tiedTotal = scored.filter((x) => x.total === best.total);
    const tiedBoth = tiedTotal.filter((x) => x.role === best.role);
    let rationale = `Fewest slots so far today (${best.total}) among ${valid.length} eligible and free`;
    if (tiedTotal.length > 1 && tiedBoth.length === 1) rationale += `; fewest times as ${s.roleKey} (${best.role}) among ${tiedTotal.length} tied`;
    if (tiedBoth.length > 1) rationale += `; ${tiedBoth.length}-way tie broken by seed ${seed}`;
    assignments.set(keyOf(s), { participantId: best.p.id, locked: false, reason: '', rationale: `${rationale}.` });
    bump(counts, best.p.id, s.roleKey);
  }

  const rotation = {
    dayId: day.id,
    seed,
    entries: toEntries(ctx, assignments),
    orphans,
    constraints: {
      fairnessRule: FAIRNESS_RULE,
      participantCount: participants.length,
      lockedCount,
      slotCount: ctx.slots.length,
      dayVersion: day.version,
    },
  };
  return finish(ctx, rotation);
}

// ---------------------------------------------------------------- validate
function validateWith(ctx, rotation) {
  const warnings = [];
  const counts = emptyCounts(ctx.participants);
  const assignments = assignmentsFrom(rotation);

  for (const u of ctx.unknownGroups) {
    warnings.push({ type: 'unknown-group', severity: 'error', periodId: u.periodId, groupId: u.groupId, message: `“${periodTitle(ctx, u.periodId)}” names a group that does not exist.` });
  }
  for (const w of ctx.schedule.warnings) if (w.type === 'group-overlap') warnings.push({ ...w, message: `${groupLabel(ctx, w.groupId)} is in “${periodTitle(ctx, w.otherPeriodId)}” and “${periodTitle(ctx, w.periodId)}” at the same time.` });

  // Entries that no longer match the day.
  const seenPairs = new Set();
  for (const e of rotation?.entries || []) {
    const pair = `${e.periodId}|${e.groupId}`;
    if (seenPairs.has(pair)) continue;
    seenPairs.add(pair);
    const stillThere = e.slots.some((s) => ctx.slotByKey.has(keyOf({ periodId: e.periodId, groupId: e.groupId, slotId: s.slotId })));
    if (!stillThere) {
      const locked = e.slots.some((s) => s.locked);
      warnings.push({ type: 'orphan', severity: 'warning', periodId: e.periodId, groupId: e.groupId, locked, message: `An assignment for a period or group no longer in this day was kept but not applied${locked ? ' (it was locked)' : ''}.` });
    }
  }
  for (const o of rotation?.orphans || []) {
    const back = ctx.slotByKey.has(keyOf(o));
    warnings.push({ type: 'orphan', severity: 'warning', periodId: o.periodId, groupId: o.groupId, slotId: o.slotId, participantId: o.participantId, locked: true,
      message: back
        ? `A locked assignment (${personLabel(ctx, o.participantId)} as ${o.roleKey}) can apply again; regenerate to restore it.`
        : `A locked assignment (${personLabel(ctx, o.participantId)} as ${o.roleKey}) no longer matches a period or group; it was kept, not applied.` });
  }

  const roleSoFar = {}; // pid -> roleKey -> count (in schedule order)
  const reported = new Set();
  for (const s of ctx.slots) {
    const a = assignments.get(keyOf(s));
    const base = { periodId: s.periodId, groupId: s.groupId, slotId: s.slotId, roleKey: s.roleKey };
    if (!a) {
      warnings.push({ type: 'not-generated', severity: 'warning', ...base, message: `${s.roleKey} in “${periodTitle(ctx, s.periodId)}” has no assignment yet. Generate or assign.` });
      continue;
    }
    if (!a.participantId) {
      warnings.push({ type: 'shortage', severity: 'warning', ...base, message: `Unfilled: ${s.roleKey} in “${periodTitle(ctx, s.periodId)}” (${groupLabel(ctx, s.groupId)}). ${shortageReason(ctx, assignments, s)}` });
      continue;
    }
    const pid = a.participantId;
    const p = ctx.personById.get(pid);
    const locked = !!a.locked;
    if (!p) {
      warnings.push({ type: 'unknown-participant', severity: 'error', ...base, participantId: pid, locked, message: `Assigned participant ${pid} is not in the participant list.` });
      continue;
    }
    if (!p.roleKeys.includes(s.roleKey)) warnings.push({ type: 'ineligible-role', severity: 'error', ...base, participantId: pid, locked, message: `${p.label} is not eligible for ${s.roleKey}${locked ? ' (locked)' : ''}.` });
    if (!p.groupIds.includes(s.groupId)) warnings.push({ type: 'not-in-group', severity: 'error', ...base, participantId: pid, locked, message: `${p.label} is not in ${groupLabel(ctx, s.groupId)}${locked ? ' (locked)' : ''}.` });
    if (isUnavailable(p, ctx.day.id, s.periodId)) warnings.push({ type: 'unavailable', severity: 'error', ...base, participantId: pid, locked, message: `${p.label} is marked unavailable for “${periodTitle(ctx, s.periodId)}”${locked ? ' but the slot is locked — edit or unlock it' : ''}.` });
    const busy = busyElsewhere(ctx, assignments, s, pid);
    if (busy) {
      const pairKey = [keyOf(s), keyOf(busy)].sort().join('/');
      if (!reported.has(pairKey)) {
        reported.add(pairKey);
        warnings.push({ type: 'conflict', severity: 'error', ...base, participantId: pid, locked, otherPeriodId: busy.periodId, message: `${p.label} is in two places at the same time: “${periodTitle(ctx, s.periodId)}” and “${periodTitle(ctx, busy.periodId)}”.` });
      }
    }
    roleSoFar[pid] = roleSoFar[pid] || {};
    const prior = roleSoFar[pid][s.roleKey] || 0;
    if (prior >= 1) {
      // Unavoidable when every other eligible, free participant had already played this role.
      const alternatives = ctx.participants.filter((q) => q.id !== pid && reasonsFor(ctx, assignments, s, q).length === 0);
      const unavoidable = alternatives.every((q) => (roleSoFar[q.id]?.[s.roleKey] || 0) >= 1);
      warnings.push({
        type: 'repeat-role', severity: 'info', ...base, participantId: pid, unavoidable,
        message: `${p.label} plays ${s.roleKey} again (time ${prior + 1}) in “${periodTitle(ctx, s.periodId)}” — ${unavoidable ? 'unavoidable: no other eligible participant was free and fresh' : 'another eligible participant was free'}.`,
      });
    }
    roleSoFar[pid][s.roleKey] = prior + 1;
    bump(counts, pid, s.roleKey);
  }
  return { warnings, counts };
}

export function validateRotation({ day, groups, participants, rotation }) {
  return validateWith(buildContext({ day, groups, participants }), rotation);
}

// ---------------------------------------------------------------- manual edits
function locate(ctx, { periodId, groupId, slotId }) {
  return ctx.slotByKey.get(keyOf({ periodId, groupId, slotId })) || null;
}

// Manual edits rebuild the entries from the current slots. A locked assignment
// whose slot no longer exists is parked in `orphans`, never dropped.
function rebuild(ctx, rotation, assignments) {
  const orphans = (rotation.orphans || []).slice();
  for (const [key, a] of assignments) {
    if (ctx.slotByKey.has(key) || !a.locked || !a.participantId || orphans.some((o) => keyOf(o) === key)) continue;
    const [periodId, groupId, slotId] = key.split('|');
    orphans.push({ periodId, groupId, slotId, roleKey: a.roleKey, participantId: a.participantId, locked: true });
  }
  return finish(ctx, { ...rotation, entries: toEntries(ctx, assignments), orphans });
}

export function assignManual({ day, groups, participants, rotation, periodId, groupId, slotId, participantId }) {
  const ctx = buildContext({ day, groups, participants });
  const slot = locate(ctx, { periodId, groupId, slotId });
  if (!slot) return { ok: false, error: 'Unknown slot for this day.' };
  const assignments = assignmentsFrom(rotation);
  const key = keyOf(slot);
  const current = assignments.get(key) || { locked: false };
  if (participantId === null) {
    assignments.set(key, { participantId: null, locked: false, reason: 'Cleared by coach.', rationale: '' });
    return { ok: true, rotation: rebuild(ctx, rotation || { dayId: day.id, seed: null, orphans: [], constraints: {} }, assignments) };
  }
  const p = ctx.personById.get(participantId);
  if (!p) return { ok: false, error: `Unknown participant ${participantId}.` };
  const without = new Map(assignments);
  without.delete(key);
  const reasons = reasonsFor(ctx, without, slot, p);
  if (reasons.length) return { ok: false, error: `Cannot assign ${p.label} to ${slot.roleKey}: ${reasons.join('; ')}.` };
  assignments.set(key, { participantId, locked: !!current.locked, reason: '', rationale: 'Set by coach.' });
  return { ok: true, rotation: rebuild(ctx, rotation || { dayId: day.id, seed: null, orphans: [], constraints: {} }, assignments) };
}

export function setLock({ day, groups, participants, rotation, periodId, groupId, slotId, locked }) {
  const ctx = buildContext({ day, groups, participants });
  const slot = locate(ctx, { periodId, groupId, slotId });
  if (!slot) return { ok: false, error: 'Unknown slot for this day.' };
  const assignments = assignmentsFrom(rotation);
  const key = keyOf(slot);
  const a = assignments.get(key);
  if (locked && (!a || !a.participantId)) return { ok: false, error: 'Cannot lock an empty slot. Assign someone first.' };
  if (!a) return { ok: true, rotation };
  assignments.set(key, { ...a, locked: !!locked });
  return { ok: true, rotation: rebuild(ctx, rotation, assignments) };
}

export function candidatesFor({ day, groups, participants, rotation, periodId, groupId, slotId }) {
  const ctx = buildContext({ day, groups, participants });
  const slot = locate(ctx, { periodId, groupId, slotId });
  if (!slot) return { valid: [], invalid: [] };
  const assignments = assignmentsFrom(rotation);
  assignments.delete(keyOf(slot));
  const valid = [];
  const invalid = [];
  for (const p of participants) {
    const reasons = reasonsFor(ctx, assignments, slot, p);
    if (reasons.length) invalid.push({ participantId: p.id, reasons });
    else valid.push(p.id);
  }
  return { valid, invalid };
}

// Flat rows for UI and print: one per slot in schedule order.
export function rotationRows({ day, groups, participants, rotation }) {
  const ctx = buildContext({ day, groups, participants });
  const assignments = assignmentsFrom(rotation);
  return ctx.slots.map((s) => {
    const a = assignments.get(keyOf(s));
    return {
      periodId: s.periodId, groupId: s.groupId, slotId: s.slotId, roleKey: s.roleKey, roleLabel: s.roleLabel,
      startMin: s.startMin, endMin: s.endMin,
      participantId: a?.participantId ?? null, locked: !!a?.locked, generated: !!a,
      reason: a && !a.participantId ? shortageReason(ctx, assignments, s) : '', rationale: a?.rationale || '',
    };
  });
}
