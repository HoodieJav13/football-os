import { useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowClockwise,
  CheckCircle,
  DownloadSimple,
  FloppyDisk,
  GitMerge,
  Printer,
  UploadSimple,
  WifiHigh,
  WifiSlash,
  X,
} from "@phosphor-icons/react";
import { Modal } from "./Modal";
import { PlayCanvas } from "./PlayCanvas";

const printLayers = {
  offense: { visible: true, dimmed: false, locked: true },
  defense: { visible: true, dimmed: false, locked: true },
  assignments: { visible: true },
};
const noop = () => {};

export function DataToolsDialog({
  activePlaybook,
  offlineStatus,
  onBackup,
  onClose,
  onConfirmRestore,
  onExportPng,
  onOpenPrint,
  onRefreshOffline,
  onRestoreFile,
  restoreCandidate,
  restoreError,
  workspace,
}) {
  const playCount = workspace.playbooks.reduce((total, book) => total + book.plays.length, 0);
  return (
    <Modal label="Backup and export" className="adjustment-modal data-tools-modal" onClose={onClose}>
      <span className="modal-label">Data and export</span>
      <h2>Protect and share your playbook</h2>
      <div className={`offline-readiness ${offlineStatus.ready ? "ready" : ""}`}>
        {offlineStatus.ready ? <WifiHigh size={24} /> : <WifiSlash size={24} />}
        <div>
          <strong>{offlineStatus.ready ? "Game-day offline copy ready" : offlineStatus.development ? "Offline copy available after production build" : "Offline copy is still preparing"}</strong>
          <span>{workspace.playbooks.length} playbooks · {playCount} plays stored on this device</span>
        </div>
        <button type="button" onClick={onRefreshOffline} disabled={offlineStatus.development}><ArrowClockwise size={17} />Refresh</button>
      </div>

      <div className="data-action-grid">
        <button type="button" onClick={onBackup}>
          <DownloadSimple size={22} />
          <span><strong>Download backup</strong><small>Everything in one restorable .footballos file</small></span>
        </button>
        <label className="file-action">
          <UploadSimple size={22} />
          <span><strong>Choose backup to restore</strong><small>Your current workspace stays safe until confirmation</small></span>
          <input type="file" accept=".footballos,application/json" onChange={onRestoreFile} />
        </label>
        <button type="button" onClick={onExportPng}>
          <DownloadSimple size={22} />
          <span><strong>Export current play as PNG</strong><small>Clean field diagram for sharing or slides</small></span>
        </button>
        <button type="button" onClick={onOpenPrint}>
          <Printer size={22} />
          <span><strong>Open PDF collection preview</strong><small>{activePlaybook.name} · print or save through the system dialog</small></span>
        </button>
      </div>

      {restoreError ? <p className="restore-error">{restoreError}</p> : null}
      {restoreCandidate ? (
        <div className="restore-preview">
          <CheckCircle size={22} weight="fill" />
          <div>
            <strong>Valid Football OS backup</strong>
            <span>{restoreCandidate.playbookCount} playbooks · {restoreCandidate.playCount} plays · {restoreCandidate.conceptCount} concepts</span>
          </div>
          <button type="button" onClick={onConfirmRestore}>Restore this backup</button>
        </div>
      ) : null}
      <button className="modal-close" type="button" onClick={onClose}><X size={18} />Close</button>
    </Modal>
  );
}

export function PrintCollectionPreview({ playbook, plays, onClose }) {
  return createPortal((
    <div className="print-preview" role="dialog" aria-modal="true" aria-label="PDF collection preview">
      <header className="print-preview-toolbar">
        <div><small>PDF collection preview</small><strong>{playbook.name} · {plays.length} plays</strong></div>
        <button type="button" onClick={() => window.print()}><Printer size={19} />Print / Save PDF</button>
        <button type="button" onClick={onClose}><X size={19} />Close</button>
      </header>
      <main className="print-pages">
        {plays.map((play, index) => (
          <article className="print-page" key={play.id}>
            <header><span>{playbook.name}</span><strong>{play.name}</strong><small>{play.personnel} · {play.formation}</small></header>
            <div className="print-field">
              <PlayCanvas
                activeTool="Select"
                draftAssignment={[]}
                layers={printLayers}
                onPointerDown={noop}
                onPointerMove={noop}
                onPointerUp={noop}
                onSelectPlayer={noop}
                onSelectAssignment={noop}
                onStartPointDrag={noop}
                play={play}
                playKey={`print-${play.id}`}
                playback="idle"
                selectedPlayerId={null}
                selectedAssignmentId={null}
                selectedUnit="offense"
                speed={1}
                view="end"
              />
            </div>
            <footer><span>{play.family} Family</span><span>{index + 1} / {plays.length}</span></footer>
          </article>
        ))}
      </main>
    </div>
  ), document.body);
}

export function SaveConceptDialog({ concepts, play, onClose, onSave }) {
  const [name, setName] = useState(play.family === "Unsorted" ? "" : play.family);
  const existing = concepts.find((concept) => concept.name.toLowerCase() === name.trim().toLowerCase());
  return (
    <Modal label="Save concept template" className="adjustment-modal details-modal" onClose={onClose} as="form" onSubmit={(event) => {
      event.preventDefault();
      if (name.trim()) onSave(name.trim());
      }}>
      <div className="adjustment-icon"><FloppyDisk size={25} /></div>
      <span className="modal-label">Reusable concept</span>
      <h2>{existing ? "Update this concept template" : "Save assignments as a template"}</h2>
      <p>The current assignment stages become reusable by matching position label. Reapplying the template preserves explicit play-level overrides.</p>
      <label className="details-field">Concept name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Mesh" required autoFocus /></label>
      <button className="modal-primary" type="submit" disabled={!name.trim()}>{existing ? "Update concept" : "Save concept"}</button>
      <button className="modal-close" type="button" onClick={onClose}><X size={18} />Cancel</button>
    </Modal>
  );
}

export function ApplyConceptDialog({ concepts, currentConceptId, onApply, onClose }) {
  const [conceptId, setConceptId] = useState(currentConceptId ?? concepts[0]?.id ?? "");
  const concept = concepts.find((item) => item.id === conceptId);
  return (
    <Modal label="Apply concept template" className="adjustment-modal details-modal" onClose={onClose} as="form" onSubmit={(event) => {
      event.preventDefault();
      if (concept) onApply(concept.id);
      }}>
      <div className="adjustment-icon"><GitMerge size={25} /></div>
      <span className="modal-label">Reusable concept</span>
      <h2>Apply assignments by position</h2>
      <p>Matching assignments are translated to this formation. Existing play-level overrides and unrelated assignments stay in place.</p>
      {concepts.length ? (
        <label className="details-field">Concept template
          <select aria-label="Concept template" value={conceptId} onChange={(event) => setConceptId(event.target.value)}>
            {concepts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.assignments.length} assignments</option>)}
          </select>
        </label>
      ) : <div className="empty-concepts"><GitMerge size={25} /><strong>No saved concepts yet</strong><span>Save the assignments from a play first.</span></div>}
      <button className="modal-primary" type="submit" disabled={!concept}>Apply concept</button>
      <button className="modal-close" type="button" onClick={onClose}><X size={18} />Cancel</button>
    </Modal>
  );
}
