import { Warning, X } from "@phosphor-icons/react";

/** The tiered feedback toast: confirmations fade, problems persist, undo offers in place. */
export function Feedback({ feedback, onAction, onDismiss }) {
  const problem = feedback?.tone === "error";
  return (
    <div
      className={`toast ${feedback ? "show" : ""} ${problem ? "is-problem" : ""}`}
      role={problem ? "alert" : "status"}
      aria-live={problem ? "assertive" : "polite"}
    >
      {problem ? <Warning size={18} weight="fill" /> : null}
      <span>{feedback?.message}</span>
      {feedback?.actionLabel ? (
        <button type="button" className="toast-action" onClick={onAction}>{feedback.actionLabel}</button>
      ) : null}
      {problem ? (
        <button type="button" className="toast-dismiss" aria-label="Dismiss message" onClick={onDismiss}>
          <X size={16} />
        </button>
      ) : null}
    </div>
  );
}
