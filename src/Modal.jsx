import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Matches the dialog exit keyframes in styles.css. */
const EXIT_MS = 160;

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * The shared shell for every dialog.
 *
 * Previously each dialog rendered its own `.modal-scrim` and had no dismissal or
 * focus handling at all: Escape did nothing, clicking the scrim did nothing, and
 * Tab walked straight out of the dialog into the header and filmstrip behind it.
 *
 * This provides, in one place:
 *  - Escape to close
 *  - a click on the scrim (but not inside the dialog) to close
 *  - a focus trap, so Tab and Shift+Tab cycle within the dialog
 *  - focus moved in on open and restored to the trigger on close
 *  - `aria-hidden` on the rest of the app while it is open
 *
 * `dismissable={false}` is for dialogs where an accidental dismissal would lose
 * work and the user should have to pick an explicit outcome.
 */
export function Modal({
  children,
  className = "",
  label,
  onClose,
  dismissable = true,
  as: Panel = "div",
  ...panelProps
}) {
  const panelRef = useRef(null);
  const scrimRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const [leaving, setLeaving] = useState(false);

  /*
   * Dismissal animates before the caller unmounts us. Callers render dialogs as
   * `{flag ? <Dialog/> : null}`, so the moment `onClose` runs the element is
   * gone and there is nothing left to animate -- this holds it for the exit and
   * then reports the close.
   *
   * Only *dismissals* route through here. Confirming an action (Save, Create,
   * Delete) closes instantly and deliberately: the outcome that follows -- a new
   * play, a toast, a changed board -- is the feedback, and making someone watch
   * a dialog leave first would put a pause between their decision and its
   * result. Withdrawing should feel like withdrawing; committing should feel
   * immediate.
   */
  const requestClose = useCallback(() => {
    if (leaving) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      onClose();
      return;
    }
    setLeaving(true);
    window.setTimeout(onClose, EXIT_MS);
  }, [leaving, onClose]);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    const panel = panelRef.current;

    // Prefer the first field, so a keyboard user lands where they will type.
    const target = panel?.querySelector("input:not([type=hidden]), textarea, select")
      ?? panel?.querySelector(FOCUSABLE);
    target?.focus();

    /*
     * Hide the rest of the app from assistive tech. This relies on the dialog
     * being portalled to <body>: applied to an ancestor of the dialog it would
     * hide the dialog itself, which is worse than not doing it at all.
     */
    const siblings = [...document.body.children].filter((child) => child !== scrimRef.current);
    const previouslyHidden = siblings.map((child) => child.getAttribute("aria-hidden"));
    siblings.forEach((child) => child.setAttribute("aria-hidden", "true"));

    return () => {
      siblings.forEach((child, index) => {
        if (previouslyHidden[index] === null) child.removeAttribute("aria-hidden");
        else child.setAttribute("aria-hidden", previouslyHidden[index]);
      });
      const restore = restoreFocusRef.current;
      if (restore instanceof HTMLElement && document.contains(restore)) {
        restore.focus();
        return;
      }
      /*
       * The trigger is often a menu item that unmounted when the dialog opened,
       * so fall back to the app shell rather than leaving focus on <body>, where
       * Tab would restart from the top of the page.
       */
      document.querySelector(".app-shell")?.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && dismissable) {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = [...(panelRef.current?.querySelectorAll(FOCUSABLE) ?? [])]
        .filter((element) => element.offsetParent !== null || element === document.activeElement);
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable.at(-1);
      const active = document.activeElement;

      // Wrap at both ends, and pull focus back in if it has escaped the dialog.
      if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panelRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [dismissable, requestClose]);

  // Portalled to <body> so the aria-hidden treatment above is sound, and so a
  // dialog is never clipped by an ancestor's overflow.
  return createPortal((
    <div
      className={`modal-scrim ${leaving ? "is-leaving" : ""}`}
      ref={scrimRef}
      onPointerDown={(event) => {
        if (dismissable && event.target === scrimRef.current) requestClose();
      }}
    >
      <Panel
        className={className}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        {...panelProps}
      >
        {children}
      </Panel>
    </div>
  ), document.body);
}
