// Fictional participant edits. Pure. Identity is the id; labels are display only.
export const PARTICIPANT_KEYS = ['id', 'label', 'roleKeys', 'groupIds', 'unavailable'];
export const PARTICIPANT_LIMITS = { label: 40, roles: 12 };
export const FICTIONAL_LABEL = /fict/i;

function mapOne(list, id, fn) {
  if (!list.some((p) => p.id === id)) throw new Error(`unknown participant ${id}`);
  return list.map((p) => (p.id === id ? fn(p) : p));
}

export function renameParticipant(list, id, label) {
  return mapOne(list, id, (p) => ({ ...p, label: String(label) }));
}

export function setRoleKeys(list, id, roleKeys) {
  return mapOne(list, id, (p) => ({ ...p, roleKeys: [...new Set(roleKeys)] }));
}

export function setGroupIds(list, id, groupIds) {
  return mapOne(list, id, (p) => ({ ...p, groupIds: [...new Set(groupIds)] }));
}

export function isUnavailable(p, dayId, periodId) {
  return (p.unavailable || []).some((u) => u.dayId === dayId && (u.periodId === null || u.periodId === periodId));
}

// Toggle availability for one period (periodId) or a whole day (periodId null).
export function setUnavailable(list, id, dayId, periodId, unavailable) {
  return mapOne(list, id, (p) => {
    const rest = (p.unavailable || []).filter((u) => !(u.dayId === dayId && u.periodId === periodId));
    return { ...p, unavailable: unavailable ? rest.concat([{ dayId, periodId }]) : rest };
  });
}

export function addParticipant(list, id, fields = {}) {
  return list.concat([{ id, label: fields.label || `Fict Scout ${list.length + 1}`, roleKeys: fields.roleKeys || [], groupIds: fields.groupIds || [], unavailable: [] }]);
}

export function removeParticipant(list, id) {
  return list.filter((p) => p.id !== id);
}

export function validateParticipant(p) {
  const errors = [];
  for (const k of Object.keys(p)) if (!PARTICIPANT_KEYS.includes(k)) errors.push(`Field “${k}” is not allowed on a fictional participant.`);
  if (typeof p.label !== 'string' || !p.label.trim() || p.label.length > PARTICIPANT_LIMITS.label) errors.push(`Label is required, up to ${PARTICIPANT_LIMITS.label} characters.`);
  else if (!FICTIONAL_LABEL.test(p.label)) errors.push('Label must stay obviously fictional: include “Fict” (for example “Fict Scout 07”). No real names.');
  if (!Array.isArray(p.roleKeys) || p.roleKeys.some((r) => typeof r !== 'string') || p.roleKeys.length > PARTICIPANT_LIMITS.roles) errors.push('Role keys must be a short list of text.');
  if (!Array.isArray(p.groupIds) || p.groupIds.some((g) => typeof g !== 'string')) errors.push('Group ids must be a list.');
  if (!Array.isArray(p.unavailable) || p.unavailable.some((u) => !u || typeof u.dayId !== 'string' || !(u.periodId === null || typeof u.periodId === 'string'))) errors.push('Unavailable must be a list of {dayId, periodId|null}.');
  return { errors };
}
