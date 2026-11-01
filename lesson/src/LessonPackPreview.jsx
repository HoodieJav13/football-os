import { ArrowClockwise, Printer, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { PlayCanvas } from "./PlayCanvas";
import { identifyDiagram, lessonPackCards, lessonSheetDiagram, shortRevision } from "./lessonPack";
import { REGION_COLORS } from "./responsibilityArea";
import { playBounds } from "./fieldView";

const OUTPUTS = [["sheet", "Assignment sheet"], ["cards", "Player cards"], ["key", "Coach key"]];
const noop = () => {};
/** Identify shows the look only; the projection has no assignments to draw anyway. */
const identifyLayers = {
  offense: { visible: true, dimmed: false, locked: true },
  defense: { visible: true, dimmed: false, locked: true },
  assignments: { visible: false },
};

function CleanCanvas({ play, playKey, layers, view, background, framingBounds = null }) {
  return (
    <div className="print-field">
      <PlayCanvas
        activeTool="Select" draftAssignment={[]} layers={layers} background={background} clean framePlay framingBounds={framingBounds}
        onPointerDown={noop} onPointerMove={noop} onPointerUp={noop} onSelectPlayer={noop} onSelectAssignment={noop} onStartPointDrag={noop}
        play={play} playKey={playKey} playback="idle" selectedPlayerId={null} selectedAssignmentId={null} selectedUnit="offense" speed={1} view={view}
      />
    </div>
  );
}

/*
 * Only the selected output is mounted. The player cards are rendered from a
 * separate answer-free projection, so the key, the legend and the authored
 * areas are absent from that DOM rather than hidden by CSS.
 */
function PlayerCards({ pack, view, background }) {
  const cards = lessonPackCards(pack);
  const revision = shortRevision(pack.revision);
  // A common overall window leaves room to draw deep answers. Only these four
  // numeric extents reach the renderer; answer areas/paths still do not.
  const framingBounds = playBounds(lessonSheetDiagram(pack));
  if (!cards.length) return <p className="lesson-pack-empty">No Identify cards yet. The Coach key explains what is missing.</p>;
  return cards.map(({ card, defenderId }) => (
    <article className="print-page identify-card" key={card}>
      <header><span>Identify · Draft prompt</span><strong>{`Card ${card} of ${cards.length}`}</strong><small>{`Revision ${revision}`}</small></header>
      <div className="identify-body">
        <p>Given your position (★) and this look, indicate your responsibility area.</p>
        <CleanCanvas play={identifyDiagram(pack.diagram, defenderId)} playKey={`identify-${card}`} layers={identifyLayers} view={view} background={background} framingBounds={framingBounds} />
      </div>
      <footer><span>Name ____________________</span><span>{`Card ${card} / ${cards.length}`}</span></footer>
    </article>
  ));
}

function CoachKey({ pack, stale }) {
  const diagram = pack.diagram;
  return (
    <article className="print-page coach-key">
      <header><span>Coach answer key · Draft</span><strong>{diagram.name}</strong><small>{`Revision ${shortRevision(pack.revision)} · ${stale ? "Stale" : "Current"}`}</small></header>
      <div className="coach-key-body">
        {stale ? <p className="coach-key-stale"><strong>Stale.</strong> The diagram has changed since this key was generated. Regenerate before using it.</p> : null}
        {pack.answers.length ? (
          <table>
            <thead><tr><th scope="col">Card</th><th scope="col">Position</th><th scope="col">Responsibility area</th><th scope="col">Job</th><th scope="col">Color</th></tr></thead>
            <tbody>
              {pack.answers.map((answer) => (
                <tr key={answer.assignmentId}>
                  <td>{answer.card}</td><td>{answer.tag}</td><td>{answer.areaLabel}</td><td>{answer.job ?? "—"}</td>
                  <td><span className="key-swatch" style={{ background: REGION_COLORS[answer.color] }} aria-hidden="true" />{answer.color}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {pack.issues.length ? (
          <section className="coach-key-issues" aria-label="Needs attention">
            <h3>Needs attention</h3>
            <ul>{pack.issues.map((issue, index) => <li key={`${issue.code}-${issue.assignmentId ?? index}`}>{issue.message}</li>)}</ul>
          </section>
        ) : null}
        {pack.unansweredDefenders.length ? <p className="coach-key-coverage">
          Positions without an authored area card: {pack.unansweredDefenders.map(item => `${item.tag || "Unlabelled"} (#${item.ordinal})`).join(", ")}.
          {" "}No responsibility is inferred for these positions.
        </p> : null}
        <p className="coach-key-note">Draft — wording comes only from your authored labels and areas.</p>
      </div>
      <footer><span>{`${diagram.personnel} · ${diagram.formation}`}</span><span>{`${pack.answers.length} answers`}</span></footer>
    </article>
  );
}

/** One authored diagram, three explicit outputs, all from the same snapshot. */
export function LessonPackPreview({ pack, stale, playbookName, view, background, layers, onRegenerate, onClose }) {
  const [output, setOutput] = useState("sheet");
  useEffect(() => {
    document.body.classList.add("lesson-pack-open");
    return () => document.body.classList.remove("lesson-pack-open");
  }, []);
  const diagram = pack.diagram;
  const outputName = OUTPUTS.find(([key]) => key === output)[1];
  const revision = shortRevision(pack.revision);
  const unanswered = pack.unansweredDefenders.length;
  return (
    <Modal label="Lesson pack" className="lesson-pack" onClose={onClose}>
      <header className="lesson-pack-toolbar">
        {/* The player view never shows the source play's name. */}
        <div className="lesson-pack-title"><small>Lesson pack · Draft</small><strong>{output === "cards" ? "Player Identify cards" : diagram.name}</strong></div>
        <div className="segmented lesson-pack-outputs" role="group" aria-label="Lesson pack output">
          {OUTPUTS.map(([key, name]) => <button key={key} type="button" className={output === key ? "active" : ""} aria-pressed={output === key} onClick={() => setOutput(key)}>{name}</button>)}
        </div>
        <span className={`lesson-pack-status ${stale ? "is-stale" : ""}`} role="status">
          {stale ? "Stale — diagram changed since this pack was made" : `Current · revision ${revision}`}
          {output === "cards" && unanswered ? ` · ${unanswered} position${unanswered === 1 ? "" : "s"} without a card` : ""}
        </span>
        <button type="button" onClick={onRegenerate}><ArrowClockwise size={18} />Regenerate</button>
        <button type="button" className="lesson-pack-print" onClick={() => window.print()}><Printer size={18} />{`Print ${outputName.toLowerCase()}`}</button>
        <button type="button" onClick={onClose}><X size={18} />Close</button>
      </header>
      <main className="print-pages lesson-pack-pages" data-output={output}>
        {output === "sheet" ? (
          <article className="print-page lesson-sheet">
            <header><span>{playbookName}</span><strong>{diagram.name}</strong><small>{`${diagram.personnel} · ${diagram.formation}`}</small></header>
            <CleanCanvas play={lessonSheetDiagram(pack)} playKey="lesson-sheet" layers={layers} view={view} background={background} />
            <footer><span>{`${diagram.family} Family`}</span><span>{`Revision ${revision}`}</span></footer>
          </article>
        ) : null}
        {output === "cards" ? <PlayerCards pack={pack} view={view} background={background} /> : null}
        {output === "key" ? <CoachKey pack={pack} stale={stale} /> : null}
      </main>
    </Modal>
  );
}
