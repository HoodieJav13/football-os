// Bounded undo stack of whole-project snapshots for destructive edits. Pure.
export function createHistory(limit = 30) {
  return { limit, entries: [] };
}

export function pushHistory(history, snapshot, label) {
  const entries = history.entries.concat([{ label, snapshot: structuredClone(snapshot) }]).slice(-history.limit);
  return { ...history, entries };
}

export function undoHistory(history) {
  if (!history.entries.length) return null;
  const last = history.entries[history.entries.length - 1];
  return { history: { ...history, entries: history.entries.slice(0, -1) }, snapshot: last.snapshot, label: last.label };
}

export function peekHistory(history) {
  return history.entries.length ? history.entries[history.entries.length - 1].label : null;
}
