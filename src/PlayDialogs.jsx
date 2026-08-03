import { useState } from "react";
import { Modal } from "./Modal";
import { basePlayers, defaultFormations, formationStatus } from "./playData";
import {
  BookOpen,
  CheckCircle,
  Copy,
  FloppyDisk,
  Play,
  Plus,
  PlusCircle,
  SlidersHorizontal,
  Trash,
  UserFocus,
  Warning,
  X,
} from "@phosphor-icons/react";

/** Dialogs for play and playbook lifecycle: create, details, formations, delete, game day. */
export function GameDayDialog({ active, play, onClose, onStart, onResolve }) {
  return (
    <Modal label="Game day adjustment" className="adjustment-modal" onClose={onClose}>
      <div className="adjustment-icon"><SlidersHorizontal size={25} /></div>
      <span className="modal-label">Temporary variation</span>
      <h2>{active ? "Resolve Game Day Adjustment" : "Game Day Adjustment"}</h2>
      <p>{active ? `Choose what to do with the temporary changes to ${play.name}.` : `Start a temporary variation of ${play.name}. The original stays protected until you decide what to keep.`}</p>
      {active ? (
        <div className="resolution-grid">
          {[
            ["discard", "Discard"],
            ["replace", "Replace Original"],
            ["variation", "Save as Variation"],
            ["new", "Save as New Play"],
          ].map(([value, label]) => <button key={value} data-resolution={value} onClick={() => onResolve(value)}>{label}</button>)}
        </div>
      ) : <button className="modal-primary" onClick={onStart}>Start adjusting</button>}
      <button className="modal-close" onClick={onClose}><X size={18} />Close</button>
    </Modal>
  );
}

export function PlayDetailsDialog({ play, onClose, onSave }) {
  const [name, setName] = useState(play.name);
  const [family, setFamily] = useState(play.family ?? "");
  const [folder, setFolder] = useState(play.folder ?? "Offense");
  const [personnel, setPersonnel] = useState(play.personnel ?? "");
  const [protection, setProtection] = useState(play.protection ?? "");
  const [blockingScheme, setBlockingScheme] = useState(play.blockingScheme ?? "");
  const status = formationStatus(play.players ?? basePlayers);
  const canSave = name.trim().length > 0 && status.legal;
  return (
    <Modal label="Play details" className="adjustment-modal details-modal" onClose={onClose} as="form" onSubmit={(event) => {
      event.preventDefault();
      if (canSave) onSave({
        name: name.trim(),
        family: family.trim() || "Unsorted",
        folder: folder.trim() || "Unfiled",
        personnel: personnel.trim() || play.personnel,
        protection: protection.trim(),
        blockingScheme: blockingScheme.trim(),
      });
      }}>
      <span className="modal-label">Play details</span>
      <h2>Keep the call clear</h2>
      {play.sourcePage ? <p className="source-reference">{play.sourceLabel} · PDF page {play.sourcePage}</p> : null}
      <label className="details-field">Play name<input value={name} onChange={(event) => setName(event.target.value)} aria-invalid={!name.trim()} required autoFocus /></label>
      <div className="details-grid">
        <label className="details-field">Folder<input value={folder} onChange={(event) => setFolder(event.target.value)} placeholder="Offense" /></label>
        <label className="details-field">Play family<input value={family} onChange={(event) => setFamily(event.target.value)} placeholder="Mesh" /></label>
        <label className="details-field">Personnel<input value={personnel} onChange={(event) => setPersonnel(event.target.value)} placeholder="11 Personnel" /></label>
        <label className="details-field">Protection<input value={protection} onChange={(event) => setProtection(event.target.value)} placeholder="Texas" /></label>
        <label className="details-field">Blocking scheme<input value={blockingScheme} onChange={(event) => setBlockingScheme(event.target.value)} placeholder="Inside zone" /></label>
      </div>
      <div className={`formation-check ${status.legal ? "legal" : "illegal"}`}>
        <CheckCircle size={22} weight="fill" />
        <div><strong>{status.legal ? "Legal formation" : "Formation needs attention"}</strong><span>{status.onLine} on the line · {status.inBackfield} in the backfield · {status.playerCount} players</span></div>
      </div>
      {!name.trim() ? <p className="form-error">A play name is required.</p> : null}
      <button className="modal-primary" type="submit" disabled={!canSave}>Save details</button>
      <button className="modal-close" type="button" onClick={onClose}><X size={18} />Cancel</button>
    </Modal>
  );
}

export function CreatePlayDialog({ currentPlay, formations, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState("formation");
  const [formationId, setFormationId] = useState(formations[0]?.id ?? "");
  const formation = formations.find((item) => item.id === formationId) ?? formations[0];
  const candidatePlayers = mode === "duplicate"
    ? currentPlay.players
    : mode === "blank"
      ? defaultFormations[0].players
      : formation?.players;
  const status = formationStatus(candidatePlayers ?? []);
  const canCreate = name.trim().length > 0 && status.legal;

  return (
    <Modal label="Create a play" className="adjustment-modal details-modal create-play-modal" onClose={onClose} as="form" onSubmit={(event) => {
      event.preventDefault();
      if (canCreate) onCreate({ formationId, mode, name: name.trim() });
      }}>
      <div className="adjustment-icon"><PlusCircle size={25} /></div>
      <span className="modal-label">New play</span>
      <h2>Choose a starting point</h2>
      <label className="details-field">Play name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Trips Right Texas" required autoFocus /></label>
      <div className="creation-modes" role="group" aria-label="Play starting point">
        <button type="button" className={mode === "formation" ? "active" : ""} aria-pressed={mode === "formation"} onClick={() => setMode("formation")}><UserFocus size={19} /><span><strong>Formation</strong><small>Use a saved alignment</small></span></button>
        <button type="button" className={mode === "blank" ? "active" : ""} aria-pressed={mode === "blank"} onClick={() => setMode("blank")}><Plus size={19} /><span><strong>Blank play</strong><small>Start from your base 11</small></span></button>
        <button type="button" className={mode === "duplicate" ? "active" : ""} aria-pressed={mode === "duplicate"} onClick={() => setMode("duplicate")}><Copy size={19} /><span><strong>Duplicate</strong><small>Copy {currentPlay.name}</small></span></button>
      </div>
      {mode === "formation" ? (
        <label className="details-field">Saved formation
          <select aria-label="Saved formation" value={formationId} onChange={(event) => setFormationId(event.target.value)}>
            {formations.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.personnel}</option>)}
          </select>
        </label>
      ) : null}
      <div className={`formation-check ${status.legal ? "legal" : "illegal"}`}>
        {status.legal ? <CheckCircle size={22} weight="fill" /> : <Warning size={22} weight="fill" />}
        <div><strong>{status.legal ? "Legal starting formation" : "Formation needs attention"}</strong><span>{status.onLine} on the line · {status.inBackfield} in the backfield · {status.playerCount} players</span></div>
      </div>
      <button className="modal-primary" type="submit" disabled={!canCreate}>Create play</button>
      <button className="modal-close" type="button" onClick={onClose}><X size={18} />Cancel</button>
    </Modal>
  );
}

export function SaveFormationDialog({ play, onClose, onSave }) {
  const [name, setName] = useState(play.formation || "");
  const status = formationStatus(play.players);
  const canSave = name.trim().length > 0 && status.legal;
  return (
    <Modal label="Save formation" className="adjustment-modal details-modal" onClose={onClose} as="form" onSubmit={(event) => {
      event.preventDefault();
      if (canSave) onSave(name.trim());
      }}>
      <div className="adjustment-icon"><FloppyDisk size={25} /></div>
      <span className="modal-label">Reusable formation</span>
      <h2>Save this alignment</h2>
      <p>The player positions and labels become a reusable starting point. Assignments are not included.</p>
      <label className="details-field">Formation name<input value={name} onChange={(event) => setName(event.target.value)} required autoFocus /></label>
      <div className={`formation-check ${status.legal ? "legal" : "illegal"}`}>
        {status.legal ? <CheckCircle size={22} weight="fill" /> : <Warning size={22} weight="fill" />}
        <div><strong>{status.legal ? "Legal formation" : "Cannot save this formation"}</strong><span>{status.onLine} on the line · {status.inBackfield} in the backfield · {status.playerCount} players</span></div>
      </div>
      <button className="modal-primary" type="submit" disabled={!canSave}>Save formation</button>
      <button className="modal-close" type="button" onClick={onClose}><X size={18} />Cancel</button>
    </Modal>
  );
}

export function ApplyFormationDialog({ currentFormation, formations, onApply, onClose }) {
  const [formationId, setFormationId] = useState(
    formations.find((formation) => formation.name === currentFormation)?.id ?? formations[0]?.id ?? "",
  );
  const formation = formations.find((item) => item.id === formationId);
  const status = formationStatus(formation?.players ?? []);
  return (
    <Modal label="Apply formation" className="adjustment-modal details-modal" onClose={onClose} as="form" onSubmit={(event) => {
      event.preventDefault();
      if (formation && status.legal) onApply(formation.id);
      }}>
      <div className="adjustment-icon"><UserFocus size={25} /></div>
      <span className="modal-label">Change alignment</span>
      <h2>Apply a saved formation</h2>
      <p>Matching players keep their assignments, translated to the new alignment. Assignments without a matching position are removed.</p>
      <label className="details-field">Saved formation
        <select aria-label="Formation to apply" value={formationId} onChange={(event) => setFormationId(event.target.value)}>
          {formations.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.personnel}</option>)}
        </select>
      </label>
      <div className={`formation-check ${status.legal ? "legal" : "illegal"}`}>
        {status.legal ? <CheckCircle size={22} weight="fill" /> : <Warning size={22} weight="fill" />}
        <div><strong>{status.legal ? "Legal saved formation" : "Formation needs attention"}</strong><span>{status.onLine} on the line · {status.inBackfield} in the backfield · {status.playerCount} players</span></div>
      </div>
      <button className="modal-primary" type="submit" disabled={!formation || !status.legal || formation.name === currentFormation}>Apply formation</button>
      <button className="modal-close" type="button" onClick={onClose}><X size={18} />Cancel</button>
    </Modal>
  );
}

export function DeletePlayDialog({ canDelete, onClose, onDelete, play }) {
  return (
    <Modal label="Delete play" className="adjustment-modal destructive-modal" onClose={onClose}>
      <div className="adjustment-icon danger-icon"><Trash size={25} /></div>
      <span className="modal-label">Delete play</span>
      <h2>{canDelete ? `Delete ${play.name}?` : "Keep at least one play"}</h2>
      <p>{canDelete ? "This removes the play from this playbook. This action is not part of undo history." : "Create another play before deleting this one."}</p>
      <button className="modal-danger" disabled={!canDelete} onClick={onDelete}>Delete play</button>
      <button className="modal-close" onClick={onClose}><X size={18} />Cancel</button>
    </Modal>
  );
}

export function NewPlaybookDialog({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const canCreate = name.trim().length > 0;
  return (
    <Modal label="Create a playbook" className="adjustment-modal details-modal" onClose={onClose} as="form" onSubmit={(event) => {
      event.preventDefault();
      if (canCreate) onCreate(name.trim());
      }}>
      <div className="adjustment-icon"><BookOpen size={25} /></div>
      <span className="modal-label">Separate playbook</span>
      <h2>Start another playbook</h2>
      <p>Your new book stays separate. You can switch between books or copy individual plays into Personal Active.</p>
      <label className="details-field">Playbook name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. 2026 Varsity Offense" required autoFocus /></label>
      <button className="modal-primary" type="submit" disabled={!canCreate}>Create playbook</button>
      <button className="modal-close" type="button" onClick={onClose}><X size={18} />Cancel</button>
    </Modal>
  );
}

/**
 * Confirmations are polite and fade; problems are announced assertively and stay
 * until dismissed or superseded. A reversible action can carry its own undo.
 */
