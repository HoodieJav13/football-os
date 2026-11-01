import { useCallback, useEffect, useRef, useState } from "react";
import { usePresence } from "./usePresence";

/**
 * Open/closed state for a popover, menu, or panel that dismisses the way users
 * expect: a click outside it, or Escape.
 *
 * Every menu in this app previously stayed open until its own trigger was
 * pressed again, so clicking the canvas left the tool menu covering it.
 *
 * Returns a ref to attach to the element that should be treated as "inside"
 * (wrap the trigger and the panel together).
 */
/** Matches the popover exit keyframe in styles.css. */
const EXIT_MS = 140;

export function useDismissable(initial = false) {
  const [open, setOpen] = useState(initial);
  const containerRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((value) => !value), []);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      // Return focus to the trigger so keyboard users are not stranded.
      containerRef.current?.querySelector("button")?.focus();
    };

    // Capture phase, so a dismissal is not swallowed by a handler inside the panel.
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  /*
   * `present` outlives `open` so the panel can animate out. Render on
   * `present`, style on `leaving`. Callers that only ever cared about the
   * boolean can keep using `open`: it still flips immediately, so aria-expanded
   * and every other bit of state stays truthful while the panel fades.
   */
  const { present, leaving } = usePresence(open, EXIT_MS);

  return { open, present, leaving, setOpen, close, toggle, containerRef };
}
