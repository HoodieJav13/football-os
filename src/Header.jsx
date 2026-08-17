import { SegmentedControl } from "./SegmentedControl";
import { useDismissable } from "./useDismissable";
import {
  BookOpen,
  Books,
  CaretDown,
  CloudCheck,
  Copy,
  DownloadSimple,
  NotePencil,
  Pause,
  Play,
  PlusCircle,
  Presentation,
  Star,
  Warning,
  WifiHigh,
  WifiSlash,
} from "@phosphor-icons/react";

/** The top bar: playbook switcher, play identity, camera switch, present and run. */
function PlaybookSwitcher({ activePlaybook, mainPlaybook, onCopy, onCreate, onDataTools, onSwitch, playbooks }) {
  const { open, present, leaving, setOpen, toggle, containerRef } = useDismissable();
  const canCopy = activePlaybook.id !== mainPlaybook.id;
  return (
    <div className="playbook-switcher" ref={containerRef}>
      <button
        className="playbook-trigger"
        aria-label={`Playbook ${activePlaybook.name}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={toggle}
      >
        <span className="playbook-icon"><Books size={21} weight="duotone" /></span>
        <span className="playbook-trigger-copy">
          <small>Playbook</small>
          <strong>{activePlaybook.name}</strong>
        </span>
        <CaretDown size={16} />
      </button>
      {present ? (
        <div className={`playbook-menu ${leaving ? "is-leaving" : ""}`} role="menu">
          <div className="playbook-menu-head">
            <span>Switch playbook</span>
            <small>{playbooks.length} saved</small>
          </div>
          {playbooks.map((book) => (
            <button
              key={book.id}
              className={book.id === activePlaybook.id ? "active" : ""}
              onClick={() => { onSwitch(book.id); setOpen(false); }}
              role="menuitem"
            >
              <span className="book-mark"><BookOpen size={20} weight={book.id === activePlaybook.id ? "fill" : "regular"} /></span>
              <span><strong>{book.name}</strong><small>{book.description ?? `${book.plays.length} plays`}</small></span>
              {book.isMain ? <span className="main-book-badge"><Star size={13} weight="fill" />Main</span> : null}
            </button>
          ))}
          <div className="playbook-menu-actions">
            {canCopy ? (
              <button onClick={() => { onCopy(); setOpen(false); }}>
                <Copy size={19} /><span><strong>Add this play to {mainPlaybook.name}</strong><small>Creates an independent copy</small></span>
              </button>
            ) : null}
            <button onClick={() => { onCreate(); setOpen(false); }}>
              <PlusCircle size={19} /><span><strong>New playbook</strong><small>Start a separate collection</small></span>
            </button>
            <button onClick={() => { onDataTools(); setOpen(false); }}>
              <DownloadSimple size={19} /><span><strong>Backup and export</strong><small>Offline copy, restore, PNG, and PDF</small></span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Header({
  activePlaybook,
  formationLegal,
  mainPlaybook,
  onCopy,
  onCreate,
  onDataTools,
  offlineStatus,
  onSwitch,
  play,
  playbooks,
  present,
  playback,
  onPresent,
  onRun,
  view,
  onView,
  temporary,
}) {
  const running = playback === "running";
  const runLabel = running ? "Pause" : playback === "paused" ? "Resume" : "Run";
  return (
    <header className="topbar">
      <div className="play-heading">
        <PlaybookSwitcher
          activePlaybook={activePlaybook}
          mainPlaybook={mainPlaybook}
          onCopy={onCopy}
          onCreate={onCreate}
          onDataTools={onDataTools}
          onSwitch={onSwitch}
          playbooks={playbooks}
        />
        <span className="heading-rule" aria-hidden="true" />
        <div>
          <span className="family-label">{play.family} Family</span>
          <div className="title-line">
            <h1>{play.name}</h1>
            {temporary ? <span className="temporary-chip">Temporary</span> : <NotePencil size={18} aria-hidden="true" />}
          </div>
          <div className="play-meta"><span>{play.personnel}</span><span>{play.formation}</span></div>
        </div>
      </div>
      <div className="top-actions">
        <span className={`offline-state ${formationLegal ? "" : "draft-state"}`}>
          {!formationLegal ? <Warning size={18} /> : offlineStatus.ready ? <WifiHigh size={18} /> : offlineStatus.online ? <CloudCheck size={18} /> : <WifiSlash size={18} />}
          {!formationLegal
            ? "Draft · fix formation"
            : offlineStatus.ready
              ? offlineStatus.online ? "Offline ready" : "Offline · ready"
              : offlineStatus.development ? "Local workspace" : "Preparing offline"}
        </span>
        <SegmentedControl value={view} onChange={onView} />
        <button className="header-button" onClick={onPresent}><Presentation size={20} weight="duotone" />{present ? "Edit" : "Present"}</button>
        {/* No caret: this toggles playback and opens no menu. */}
        <button className={`run-button ${running ? "is-running" : ""}`} onClick={onRun}>
          {running ? <Pause size={21} weight="fill" /> : <Play size={21} weight="fill" />}
          {runLabel}
        </button>
      </div>
    </header>
  );
}

/**
 * Play thumbnail.
 *
 * These were drawn through the whole fixed field window, so a 112x68 card showed
 * the play at about 2.4 px/yd occupying under half the box — six variants of the
 * same family were indistinguishable smudges. Framing each thumbnail to its own
 * play makes the differences the browser exists to show actually visible, and
 * uses the same projection as the canvas so it stays a faithful miniature.
 */
