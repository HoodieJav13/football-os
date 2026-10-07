import { createContext, useContext } from "react";
import { DownloadSimple, LockSimple, PencilSimple, Warning, X } from "@phosphor-icons/react";

/**
 * Lets an open dialog say that another tab is waiting for it. The bottom
 * notice sits under a modal's scrim, and the dialog is exactly what is
 * holding the handover up, so it is the place to say so.
 */
export const HandoverNoticeContext = createContext(null);

export function HandoverNotice() {
  const notice = useContext(HandoverNoticeContext);
  if (!notice) return null;
  return <p className="handover-notice" role="status">{notice}</p>;
}

function describeBlocked(blocked, { own }) {
  if (!blocked) return null;
  if (blocked.kind === "drafts") {
    const list = blocked.drafts.join(", ");
    return own
      ? `Finish or cancel first: ${list}.`
      : `It has unfinished changes (${list}). Switch to that tab to save or cancel them.`;
  }
  if (blocked.kind === "conflict") {
    return own
      ? "Saving is paused because the saved data changed outside this tab. Resolve that first."
      : "It found saved data changed outside it and paused saving until that is resolved.";
  }
  if (blocked.kind === "deferred") {
    return "Another tab took over just before your request reached it. Cancel and choose Edit here again if you still want to edit.";
  }
  if (blocked.kind === "save") {
    return own
      ? `Your changes could not be saved${blocked.message ? ` (${blocked.message})` : ""}, so this tab keeps editing. Download a preservation file.`
      : `It could not save its changes${blocked.message ? ` (${blocked.message})` : ""}, so it keeps editing until that is fixed.`;
  }
  return own ? "Handover is waiting." : "The editing tab has not handed over yet.";
}

/** The header chip that says this tab cannot edit. */
export function ViewOnlyChip() {
  return <span className="authority-chip"><LockSimple size={13} />View only</span>;
}

/**
 * Explains who may edit and offers the one safe next step. Shown only when
 * there is something to say; an uncontested editor sees nothing.
 */
export function AuthorityBanner({ auth, conflict, preserved, storedPreserved = preserved, storedUnavailable = null, dismissed = false, onDismiss, onEditHere, onCancel, onPreserve, onKeepMine, onLoadSaved }) {
  const preserveButton = (
    <button type="button" onClick={onPreserve}><DownloadSimple size={17} />{preserved ? "Download again" : "Download preservation file"}</button>
  );

  if (auth.status === "editor" && conflict) {
    return (
      <aside className="authority-banner is-problem" role="alert">
        <strong><Warning size={17} weight="fill" />Saving paused</strong>
        <p>The saved playbook was changed outside this tab (another window or an older version of Football OS). Nothing has been overwritten, and your changes are still here.</p>
        <p className="authority-hint">{!preserved
          ? "Download the preservation file first: it holds both versions, so neither is lost whichever you choose."
          : storedPreserved
            ? "The preservation file holds both versions. Choose which one to keep editing."
            : `The version in storage could not be read${storedUnavailable ? ` (${storedUnavailable})` : ""}, so it is not in the file. Keep this tab's version stays blocked until a file holds it; Load saved version is available because this tab's version is in the file.`}</p>
        <div className="authority-actions">
          {preserveButton}
          <button type="button" disabled={!storedPreserved} onClick={onKeepMine}>Keep this tab's version</button>
          <button type="button" disabled={!preserved} onClick={onLoadSaved}>Load saved version</button>
        </div>
      </aside>
    );
  }

  if (auth.status === "editor") {
    if (!auth.requested) return null;
    return (
      <aside className="authority-banner" role="status">
        <strong><PencilSimple size={17} />Another tab asked to edit</strong>
        <p>{auth.blocked ? describeBlocked(auth.blocked, { own: true }) : "Saving your changes, then handing over."}</p>
        {auth.blocked?.kind === "save" ? <div className="authority-actions">{preserveButton}</div> : null}
      </aside>
    );
  }

  if (auth.status === "starting") return null;

  if (auth.status === "unsupported") {
    if (dismissed) return null;
    return (
      <aside className="authority-banner" role="status">
        <strong><LockSimple size={17} />View only in this browser</strong>
        <p>This browser cannot make sure only one tab edits your playbooks (it has no Web Locks support), so editing is off to keep two tabs from overwriting each other.</p>
        <p className="authority-hint">Update Safari (iPadOS 15.4 or later) or use a current browser, then reopen Football OS. Viewing, presenting, exports and backup download still work.</p>
        <div className="authority-actions"><button type="button" onClick={onDismiss}>Got it</button></div>
      </aside>
    );
  }

  if (auth.status === "requesting") {
    return (
      <aside className="authority-banner" role="status">
        <strong><PencilSimple size={17} />Waiting for the editing tab</strong>
        <p>{auth.editorBlocked ? describeBlocked(auth.editorBlocked, { own: false }) : "It hands over as soon as its changes are saved. A suspended or closed tab hands over when it next wakes or closes."}</p>
        <div className="authority-actions"><button type="button" onClick={onCancel}><X size={17} />Cancel request</button></div>
      </aside>
    );
  }

  const lost = auth.reason?.kind === "lost";
  // The steady view-only state lives in the header (chip and Edit here); this
  // notice only announces a change, then steps aside so it never sits over the
  // backfield. A lost lease stays: it holds work the coach must keep.
  if (dismissed && !lost) return null;
  const message = lost
    ? "This tab stopped being the editor while it was suspended. Anything it had not saved is still on this screen."
    : auth.reason?.kind === "handed-over"
      ? "Editing moved to another tab. This tab is view only."
      : auth.reason?.kind === "acquire-failed"
        ? `This tab could not open the saved workspace for editing: ${auth.reason.message}`
        : auth.editorPresent === false
          ? "View only. No tab is editing this workspace right now."
          : "View only. This workspace is being edited in another tab.";
  return (
    <aside className={`authority-banner ${lost ? "is-problem" : ""}`} role="status">
      <p><LockSimple size={16} />{message}</p>
      {lost ? <p className="authority-hint">Download a preservation file before editing again: editing here starts from the saved workspace.</p> : null}
      {lost ? (
        <div className="authority-actions">
          {preserveButton}
          <button type="button" className="authority-primary" disabled={!preserved} onClick={onEditHere}><PencilSimple size={17} />Edit here</button>
        </div>
      ) : null}
    </aside>
  );
}
