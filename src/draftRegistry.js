import { useLayoutEffect, useRef } from "react";

/*
 * Unfinished work that exists only in the UI: a dialog with typed but unsaved
 * values, a text field that commits on blur, a backup chosen but not yet
 * confirmed. Handing editing to another tab waits until there are none, so
 * nothing a coach typed is ever discarded silently; a preservation file lists
 * them with their values.
 *
 * Gestures in progress (a drag, a stroke) are reported by the app directly,
 * because they live in refs rather than components.
 */

const drafts = new Map();
const listeners = new Set();
let version = 0;
const notify = () => { version += 1; for (const listener of listeners) listener(); };

/**
 * Changes on every draft change, so a parent can re-render when only a
 * child's typed value changed (useSyncExternalStore). Without it, anything
 * the parent derives from drafts -- whether a preservation file is still
 * current, whether leaving should ask -- went stale until something else
 * happened to re-render it.
 */
export const getDraftsVersion = () => version;

export function listDrafts() {
  return [...drafts.entries()].map(([id, draft]) => ({ id, label: draft.label, values: draft.values }));
}

export function subscribeDrafts(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Registers `values` as an unfinished draft while `dirty` is true. */
export function useDraft(id, { dirty, label, values }) {
  const key = useRef(`${id}:${Math.random().toString(36).slice(2, 8)}`).current;
  const serialized = dirty ? JSON.stringify(values ?? null) : null;
  useLayoutEffect(() => {
    if (!dirty) {
      if (drafts.delete(key)) notify();
      return undefined;
    }
    drafts.set(key, { label, values: JSON.parse(serialized) });
    notify();
    return undefined;
  }, [dirty, key, label, serialized]);
  useLayoutEffect(() => () => { if (drafts.delete(key)) notify(); }, [key]);
}
