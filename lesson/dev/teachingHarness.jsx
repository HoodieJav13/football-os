// Development-only proof of the Teaching journey. Not a production route: index.html is the
// only build input, so this file is outside dist. State is synthetic and in memory, and every
// teaching rule below runs in the existing pure models, reached through schemeTeachingBridge.
import { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { buildRecheckProjection, deriveCoachKeySheet, deriveLearnerProjection, readSchemeText, schemeRefFor } from "../src/schemePackage.js";
import { buildSchemeTeachingDraft, createSyntheticTeachingLoop, roleGroups } from "./teaching/src/domain/schemeTeachingBridge.ts";
import { emptyReviewQuestion } from "./teaching/src/domain/teachingReview.ts";
import { QUESTION_SLOTS } from "./teaching/src/domain/teachingValidation.ts";
import './teachingHarness.css';

const PROFILE = "synthetic-player-a";
const REF_BASE = { teamId: "synthetic-team", seasonId: "synthetic-season" };
const STATUS_LABELS = {
  submission: { none: "No response yet", acknowledged: "Submission received (not a grade)" },
  coachRelease: { "not-released": "Coach feedback not released", released: "Coach feedback released" },
  fieldObserved: { "not-observed": "Not observed in the field", observed: "Field observation recorded" },
};

function CardPicture({ card }) {
  const { frame, look } = card;
  const x = (value) => value - frame.minX;
  const y = (value) => frame.maxY - value;
  return (
    <svg viewBox={`0 0 ${frame.maxX - frame.minX} ${frame.maxY - frame.minY}`} width="420" role="img" aria-label="Offense and anonymous defenders. One defender is starred.">
      <rect width="100%" height="100%" fill="#f5f8f6" />
      <line x1="0" x2={frame.maxX - frame.minX} y1={y(0)} y2={y(0)} stroke="#6b767a" strokeWidth="0.2" />
      {look.offense.map((player) => <g key={player.id}><circle cx={x(player.x)} cy={y(player.y)} r="1.2" fill="#fff" stroke="#14181a" strokeWidth="0.2" /><text x={x(player.x)} y={y(player.y)} fontSize="1" textAnchor="middle" dominantBaseline="central">{player.label}</text></g>)}
      {look.defense.map((player) => (player.label ? <g key={player.id}><circle cx={x(player.x)} cy={y(player.y)} r="1.6" fill="#14181a" /><text x={x(player.x)} y={y(player.y)} fontSize="2" fill="#fff" textAnchor="middle" dominantBaseline="central">{player.label}</text></g> : <circle key={player.id} cx={x(player.x)} cy={y(player.y)} r="1" fill="#fff" stroke="#6b767a" strokeWidth="0.2" />))}
    </svg>
  );
}

const sourceOf = (pkg, callId) => ({ ...schemeRefFor(pkg, callId), approvalStatus: pkg.approval.status });

function questionsOf(assignment) {
  return QUESTION_SLOTS.flatMap((slot) => (assignment.snapshot.questions[slot] ? [{ slot, question: assignment.snapshot.questions[slot] }] : []));
}

function LearnerPane({ loop, assignment, cards, onChange, version }) {
  const [answers, setAnswers] = useState({});
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState(null);
  const attempt = loop.getAttempt(assignment.ref, PROFILE);
  const feedback = loop.ownFeedback(assignment.ref, PROFILE);
  const submit = () => {
    try { setReceipt(loop.submit(assignment.ref, PROFILE, answers)); setError(null); onChange(); } catch (failure) { setError(failure.message); }
  };
  return (
    <section aria-label="Learner view" data-harness="learner" data-assignment={assignment.ref.assignmentId} data-version={version}>
      <h3>Learner view</h3>
      {questionsOf(assignment).map(({ slot, question }, index) => (
        <article key={question.id} data-harness="question">
          <CardPicture card={cards[Number(question.id.split("-").at(-1)) - 1]} />
          <p>{question.prompt}</p>
          {attempt ? <p data-harness="frozen-response">{`Your response: ${attempt.responses[slot] ?? ""}`}</p> : <textarea aria-label={`Response ${index + 1}`} data-harness="response" value={answers[slot] ?? ""} onChange={(event) => setAnswers({ ...answers, [slot]: event.target.value })} />}
        </article>
      ))}
      {attempt ? null : <button type="button" data-harness="submit" onClick={submit}>Submit response</button>}
      {receipt || attempt ? <p role="status" data-harness="acknowledgement">Submission received. This is an acknowledgement, not a grade.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {feedback.length ? <ul data-harness="released-feedback">{feedback.at(-1).questions.map((item) => <li key={item.questionId}>{`${item.judgment ?? "No judgment"}: ${item.explanation}`}</li>)}</ul> : <p data-harness="no-feedback">No coach feedback has been released.</p>}
    </section>
  );
}

function CoachPane({ loop, assignment, sheet, onChange }) {
  const [drafts, setDrafts] = useState({});
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);
  const { model, keys } = loop.coachReview(assignment.ref);
  const status = loop.statusOf(assignment.ref, PROFILE);
  const entry = (slot) => model.questions.find((item) => item.slot === slot)?.required.find((item) => item.profileId === PROFILE);
  const change = (id, patch) => setDrafts({ ...drafts, [id]: { judgment: null, explanation: "", ...drafts[id], ...patch } });
  const attempt = async (action) => { try { await action(); setError(null); onChange(); } catch (failure) { setError(failure.message); } };
  const saveReview = () => attempt(() => loop.saveReview(assignment.ref, PROFILE, {
    questions: questionsOf(assignment).filter(({ question }) => drafts[question.id]).map(({ question }) => ({
      ...emptyReviewQuestion(question.id), reviewed: true, playerSafeFeedback: { judgment: drafts[question.id].judgment, explanation: drafts[question.id].explanation },
    })),
  }));
  return (
    <section aria-label="Coach review" data-harness="coach" data-assignment={assignment.ref.assignmentId}>
      <h3>Coach review (coach only)</h3>
      <ul data-harness="status">{Object.entries(status).map(([axis, value]) => <li key={axis} data-axis={axis} data-value={value}>{STATUS_LABELS[axis][value]}</li>)}</ul>
      {questionsOf(assignment).map(({ slot, question }) => (
        <article key={question.id} data-harness="review-item">
          <p>{question.prompt}</p>
          <p>{`Response: ${entry(slot)?.response ?? "None submitted"}`}</p>
          <p data-harness="coach-rubric">{`Authored key: ${keys[slot] ?? "Held"}`}</p>
          <select aria-label="Coach judgment" data-harness="judgment" value={drafts[question.id]?.judgment ?? ""} disabled={!entry(slot)} onChange={(event) => change(question.id, { judgment: event.target.value || null })}>
            <option value="">No judgment</option><option value="correct">Correct</option><option value="needsCorrection">Needs correction</option>
          </select>
          <textarea aria-label="Player-safe explanation" data-harness="explanation" disabled={!entry(slot)} value={drafts[question.id]?.explanation ?? ""} onChange={(event) => change(question.id, { explanation: event.target.value })} />
        </article>
      ))}
      <button type="button" data-harness="save-review" onClick={saveReview}>Save review</button>
      <button type="button" data-harness="release" onClick={() => attempt(() => loop.release(assignment.ref, PROFILE))}>Release feedback</button>
      <p>{sheet.entries.some((item) => item.status === "held") ? "Some questions are held for missing keys, so they were not asked." : "All asked questions have an authored key."}</p>
      <label>Field observation note <input data-harness="field-note" value={note} onChange={(event) => setNote(event.target.value)} /></label>
      <button type="button" data-harness="record-field" onClick={() => attempt(() => loop.recordFieldObservation(assignment.ref, PROFILE, note))}>Record field observation</button>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

function Harness() {
  const loop = useMemo(() => createSyntheticTeachingLoop(), []);
  const [pkg, setPkg] = useState(null);
  const [callId, setCallId] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [held, setHeld] = useState([]);
  const [message, setMessage] = useState(null);
  const [version, setVersion] = useState(0);
  const ticket = useRef(0);
  const refresh = () => setVersion((value) => value + 1);
  const call = pkg?.calls.find((item) => item.callId === callId) ?? pkg?.calls[0] ?? null;
  const approved = pkg?.approval.status === "approved";

  const chooseFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const mine = ++ticket.current;
    const read = await readSchemeText(await file.text());
    if (mine !== ticket.current) return;
    if (!read.ok) { setMessage(`Rejected: ${read.errors[0].message}`); return; }
    setPkg(read.pkg);
    setHeld([]);
    setMessage(read.pkg.approval.status === "approved" ? `Revision ${read.pkg.revision} loaded. Earlier assignments keep their own revision.` : `Held: revision ${read.pkg.revision} is not approved, so nothing can be published.`);
  };

  const publishCards = async ({ projection, cardNumbers, title, parentAssignmentId = null, changeNotice }) => {
    const source = sourceOf(pkg, call.callId);
    const sheet = deriveCoachKeySheet(pkg, call.callId);
    const draft = buildSchemeTeachingDraft({ identifyProjection: projection, coachKeySheet: sheet, source, cardNumbers, title });
    setHeld((current) => [...current, ...draft.held]);
    if (!draft.definition.questions.length) { setMessage("Held: no question in this group has an approved, authored key. Nothing was published."); return; }
    const assignmentId = `synthetic-${crypto.randomUUID()}`;
    const published = await loop.publish({ ref: { ...REF_BASE, assignmentId }, draft, expectedProfileIds: [PROFILE], changeNotice, parentAssignmentId });
    setAssignments((current) => [...current, { assignment: published, source, cards: published.pictureCards, sheet, title, revision: pkg.revision }]);
    setMessage(`${title} published from revision ${pkg.revision}.`);
  };

  const run = (action) => async () => {
    try { await action(); } catch (failure) { setMessage(`Nothing was published: ${failure.message}`); }
  };
  const publishGroup = (cardNumbers, index) => run(async () => {
    const projection = await deriveLearnerProjection(pkg, "identify", schemeRefFor(pkg, call.callId));
    await publishCards({ projection, cardNumbers, title: `Role group ${index + 1}`, changeNotice: `Synthetic role group ${index + 1}` });
  });
  const publishRecheck = (scenario) => run(async () => {
    const parent = assignments.find((item) => item.source.callId === call.callId);
    if (!parent) { setMessage("Publish and answer the original group first."); return; }
    const projection = await buildRecheckProjection(pkg, scenario);
    if (projection.held) { setMessage(`Held: ${projection.reason}. The recheck was not published.`); return; }
    await publishCards({ projection, cardNumbers: parent.assignment.cardNumbers, title: `Changed-picture recheck ${scenario.scenarioId}`, parentAssignmentId: parent.assignment.ref.assignmentId, changeNotice: "Changed-picture recheck, linked to the original check" });
  });

  const groups = call ? roleGroups(call.roles.length) : [];
  const scenarios = (pkg?.scenarios ?? []).filter((item) => item.callId === call?.callId);
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif" }} data-harness="root" data-version={version}>
      <h1>Local Teaching harness</h1>
      <p role="note">Development only. Synthetic local state, lost on reload. No Team Hub, account, real profile or live data is involved.</p>
      <label>Coach-only scheme package <input type="file" accept=".json,application/json" data-harness="package-file" onChange={chooseFile} /></label>
      {message ? <p role="status" data-harness="message">{message}</p> : null}
      {pkg ? (
        <section aria-label="Package" data-harness="package" data-approved={String(approved)}>
          <h2>{`${pkg.packageId} · revision ${pkg.revision} · ${pkg.approval.status}`}</h2>
          <label>Call <select data-harness="call" value={call.callId} onChange={(event) => setCallId(event.target.value)}>{pkg.calls.map((item) => <option key={item.callId} value={item.callId}>{item.learnerContext.callName}</option>)}</select></label>
          <p>{`All ${call.roles.length} roles are covered in ${groups.length} groups, because one assignment holds at most ten questions.`}</p>
          {groups.map((cardNumbers, index) => <button type="button" key={cardNumbers[0]} data-harness="publish-group" disabled={!approved} onClick={publishGroup(cardNumbers, index)}>{`Publish role group ${index + 1} (cards ${cardNumbers[0]}–${cardNumbers.at(-1)})`}</button>)}
          {scenarios.map((scenario) => <button type="button" key={scenario.scenarioId} data-harness="publish-recheck" onClick={publishRecheck(scenario)}>{`Publish changed-picture recheck (${scenario.scenarioId})`}</button>)}
        </section>
      ) : null}
      {held.length ? <ul data-harness="held">{held.map((item, index) => <li key={index}>{`Card ${item.card} held: ${item.reason}`}</li>)}</ul> : null}
      {assignments.map(({ assignment, cards, sheet, title, revision }) => (
        <section key={assignment.ref.assignmentId} aria-label={title} data-harness="assignment" data-revision={revision} data-parent={assignment.snapshot.parentAssignmentId ?? ""}>
          <h2>{`${title} · revision ${revision}`}</h2>
          <LearnerPane loop={loop} assignment={assignment} cards={cards} onChange={refresh} version={version} />
          <CoachPane loop={loop} assignment={assignment} sheet={sheet} onChange={refresh} />
        </section>
      ))}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<Harness />);
