import { useEffect, useState } from "react";

/**
 * Keeps an element mounted long enough to animate itself out.
 *
 * Entrances were easy -- an element appears and plays a keyframe. Exits are
 * not: React unmounts the moment the condition flips, so there is nothing left
 * to animate and every dismissal popped. This holds the element in the tree for
 * the exit's duration and reports `leaving`, so the caller can style the way
 * out. It is deliberately time-based rather than transitionend-based: a missed
 * or coalesced transitionend would strand a dead element on screen forever,
 * whereas an early timer only clips the tail of an animation nobody is watching.
 *
 * Under prefers-reduced-motion the element leaves immediately, matching the
 * global rule that collapses animation durations.
 *
 * @param open  whether the element should be showing
 * @param exitMs how long its exit animation runs
 * @returns `{ present, leaving }` -- render while `present`, style with `leaving`
 */
export function usePresence(open, exitMs = 160) {
  const [present, setPresent] = useState(open);

  useEffect(() => {
    if (open) {
      setPresent(true);
      return undefined;
    }
    if (!present) return undefined;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduced) {
      setPresent(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setPresent(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [open, present, exitMs]);

  return { present, leaving: present && !open };
}
