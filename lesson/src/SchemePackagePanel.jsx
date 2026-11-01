import { useMemo, useRef, useState } from "react";
import { Modal } from "./Modal";
import { createSchemeDemoDraft } from "./schemeDemo";
import { bindDiagramToCall, diagramForCall } from "./schemeLesson";
import {
  JOB_TEXT_FIELDS, LOCAL_TEST_ACTION, LOCAL_TEST_LABEL, keyBindingStatus, regenerateCoachKey,
  applySchemeImport, approveSchemePackage, createCorrectionDraft, createDraftRevision, currentSchemeRef, diffCallRoles,
  freezeSchemePackage, getSchemePackage, listSchemeRevisions, planSchemeImport, readSchemeCorrection, serializeSchemePackage, validateSchemePackage,
} from "./schemePackage";
import "./schemePackage.css";

const FIELD_LABELS = { key: "Key", decision: "Decision", responsibility: "Responsibility", finish: "Finish", fallback: "Fallback", runFitOwnership: "Run fit" };
const short = (digest) => (digest ? digest.slice(0, 12) : "none");

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const coachFileName = (pkg) => `coach-scheme-package-${pkg.packageId}-r${pkg.revision}-coach-only.json`;

/** Source, interpretation, approval and doctrine stay visibly separate records. */
function AuthorityRecords({ pkg }) {
  return (
    <section className="scheme-section" aria-label="Evidence and authority">
      <h3>Evidence and authority</h3>
      <div className="scheme-authority">
        <div>
          <h4>Sources (evidence)</h4>
          <ul>{pkg.sourceRefs.map((source) => <li key={source.sourceId}><span>{source.locator}</span> <small>{source.reviewExtent}</small></li>)}</ul>
        </div>
        <div>
          <h4>Interpretation (not adopted)</h4>
          <ul>{pkg.interpretations.map((item) => <li key={item.interpretationId}>{item.analystClaim} <small>{item.uncertainty}</small></li>)}</ul>
        </div>
        <div>
          <h4>Package approval</h4>
          <p data-scheme="approval-status">{pkg.approval.status === "approved" ? pkg.approval.displayLabel ?? LOCAL_TEST_LABEL : "Not approved"}</p>
          <small>Unsigned JSON does not authenticate a person.</small>
        </div>
        <div>
          <h4>Program doctrine</h4>
          <p data-scheme="doctrine-status">Not adopted. No KB release.</p>
        </div>
      </div>
    </section>
  );
}

function IssueList({ validation }) {
  if (!validation.errors.length && !validation.warnings.length && !validation.heldAssets.length) return null;
  return (
    <section className="scheme-section scheme-issues" aria-label="Needs attention" data-scheme="issues">
      <h3>Needs attention</h3>
      <ul>
        {validation.errors.map((item, i) => <li key={`e-${i}`} className="is-error">{item.message} <small>{item.path}</small></li>)}
        {validation.heldAssets.map((item, i) => <li key={`h-${i}`} className="is-error">Held: the {item.kind} for {item.callId} is missing.</li>)}
        {validation.warnings.map((item, i) => <li key={`w-${i}`}>{item.message} <small>{item.path}</small></li>)}
      </ul>
    </section>
  );
}

function RoleEditor({ call, base, locked, onRole }) {
  const diff = useMemo(() => (base ? diffCallRoles(base, call) : null), [base, call]);
  const changedOf = new Map((diff?.changedRoles ?? []).map((item) => [item.roleId, item.fields]));
  return (
    <div className="scheme-table-wrap">
      <table className="scheme-roles">
        <thead>
          <tr><th scope="col">Position</th><th scope="col">Unit</th>{JOB_TEXT_FIELDS.map((field) => <th scope="col" key={field}>{FIELD_LABELS[field]}</th>)}<th scope="col">Changed from base</th></tr>
        </thead>
        <tbody>
          {call.roles.map((role, roleIndex) => (
            <tr key={role.roleId} data-role={role.roleId} className={changedOf.has(role.roleId) ? "is-changed" : ""}>
              <th scope="row">{role.positionLabel}<small style={{display: "block", color: "var(--text-mid)", fontWeight: 400}}>{`Role ${roleIndex + 1} · ${role.alignment?.x ?? "?"}, ${role.alignment?.y ?? "?"}`}</small></th>
              <td>
                <select aria-label={`${role.positionLabel} role ${roleIndex + 1} unit`} value={role.unit} disabled={locked} onChange={(event) => onRole(role.roleId, "unit", event.target.value)}>
                  <option value="rush">Rush</option><option value="coverage">Coverage</option>
                </select>
              </td>
              {JOB_TEXT_FIELDS.map((field) => (
                <td key={field}><textarea aria-label={`${role.positionLabel} role ${roleIndex + 1} ${FIELD_LABELS[field]}`} data-field={field} rows={2} value={role[field] ?? ""} disabled={locked} onChange={(event) => onRole(role.roleId, field, event.target.value)} /></td>
              ))}
              <td>{base ? (changedOf.get(role.roleId)?.join(", ") ?? "Same job") : "Base call"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportPreview({ plan, busy, onConfirm, onCancel }) {
  const conflict = plan.action === "conflict";
  const rejected = plan.action === "rejected";
  return (
    <section className="scheme-section scheme-preview" aria-label="Import preview" data-scheme="import-preview" data-action={plan.action}>
      <h3>Import preview: {plan.action}</h3>
      {plan.incoming ? <p>{`${plan.incoming.packageId} · revision ${plan.incoming.revision} · ${short(plan.incoming.contentDigest)} · ${plan.incoming.calls.length} calls`}</p> : null}
      {plan.approvalClaim ? <p>{`Approval claim: ${plan.approvalClaim.status}. Claims are not authenticated.`}</p> : null}
      <ul>
        {plan.errors.map((item, i) => <li key={`e-${i}`} className="is-error">{item.message}</li>)}
        {plan.conflicts.map((item, i) => <li key={`c-${i}`} className="is-error">{`Conflict: ${item.code}`}</li>)}
        {plan.heldAssets.map((item, i) => <li key={`h-${i}`} className="is-error">{`Held: missing ${item.kind} for ${item.callId}`}</li>)}
      </ul>
      <div className="scheme-actions">
        {rejected ? null : conflict ? (
          <>
            <button type="button" disabled={busy} onClick={() => onConfirm("keep-current")}>Keep current, retain this file</button>
            <button type="button" disabled={busy} onClick={() => onConfirm("adopt-incoming")}>Use this file, retain current</button>
          </>
        ) : <button type="button" disabled={busy} onClick={() => onConfirm(undefined)}>{plan.action === "noop" ? "Acknowledge" : "Confirm import"}</button>}
        <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

/** Authoring surface for one package. Bytes change only through explicit, confirmed actions. */
export function SchemePackagePanel({ library, currentPlay, canWrite, saveError, onCommit, onDraftChange, onOpenDiagram, onClose }) {
  const [selectedPackageId, setSelectedPackageId] = useState(null);
  const [selectedCallId, setSelectedCallId] = useState(null);
  const [plan, setPlan] = useState(null);
  const [correction, setCorrection] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmingApproval, setConfirmingApproval] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const ticket = useRef(0);

  const draft = library.draft ?? null;
  const packageIds = Object.keys(library.packages);
  const currentPackageId = draft?.packageId ?? (packageIds.includes(selectedPackageId) ? selectedPackageId : packageIds[0]) ?? null;
  const current = currentPackageId ? getSchemePackage(library, currentPackageId) : null;
  const shown = draft ?? current;
  const revisions = currentPackageId ? listSchemeRevisions(library, currentPackageId) : [];
  const validation = useMemo(() => (shown ? validateSchemePackage(shown) : null), [shown]);
  const call = shown?.calls.find((item) => item.callId === selectedCallId) ?? shown?.calls[0] ?? null;
  const base = call?.variantOf ? shown.calls.find((item) => item.callId === call.variantOf) ?? null : null;
  const editable = canWrite && Boolean(draft) && draft.frozen !== true;
  const readiness = validation?.callStatus.find((item) => item.callId === call?.callId)?.readiness;
  const keyRecord = shown?.coachKeys?.find(item => item.keyId === call?.coachKeyRef?.keyId) ?? null;
  const keyStatus = call ? keyBindingStatus(shown, call.callId) : 'missing';

  const report = (kind, text) => setMessage({ kind, text });
  const commit = (next, okText) => {
    const result = onCommit(next);
    if (result.ok) { setUnsaved(false); report("ok", `${okText} Saved locally.`); } else report("error", `${result.error} Nothing was changed.`);
    return result.ok;
  };

  /** Latest action wins: a stale digest or file read can never replace newer work. */
  const run = async (action) => {
    const mine = ++ticket.current;
    setBusy(true);
    try {
      await action(() => mine === ticket.current);
    } catch (error) {
      if (mine === ticket.current) report("error", `${error.message} Nothing was changed.`);
    } finally {
      if (mine === ticket.current) setBusy(false);
    }
  };

  const editDraft = (next) => { setUnsaved(true); setMessage(null); onDraftChange({ ...library, draft: next }); };
  const editRole = (roleId, field, value) => editDraft({
    ...draft,
    calls: draft.calls.map((item) => (item.callId !== call.callId ? item : { ...item, roles: item.roles.map((role) => (role.roleId === roleId ? { ...role, [field]: value } : role)) })),
  });
  const editCall = (field, value) => editDraft({ ...draft, calls: draft.calls.map((item) => (item.callId === call.callId ? { ...item, [field]: value } : item)) });

  const loadDemo = () => run(async fresh => {
    let demo = createSchemeDemoDraft();
    for (const item of demo.calls) demo = await regenerateCoachKey(demo, item.callId);
    if (fresh()) commit({ ...library, draft: demo }, "Synthetic demo family loaded with its originally authored keys.");
  });
  const editAnswer = (roleId, value) => editDraft({ ...draft, coachKeys: draft.coachKeys.map(record => record.keyId !== call.coachKeyRef?.keyId ? record : { ...record, answers: record.answers.map(answer => answer.roleId === roleId ? { ...answer, answer: value || null } : answer) }) });
  const regenerateKey = () => run(async fresh => {
    const next = await regenerateCoachKey(draft, call.callId);
    if (fresh()) { editDraft(next); report('ok', 'Coach key regenerated from the reviewed authored answers for this call. Save or freeze to keep it.'); }
  });
  const startRevision = () => run(async () => { commit({ ...library, draft: createDraftRevision(current) }, `Draft revision ${current.revision + 1} started.`); });
  const reopenFrozen = () => commit({ ...library, draft: { ...draft, frozen: false, contentDigest: null, callDigests: {} } }, "Freeze cleared. This revision was not approved, so it is editable again.");
  const bindDiagram = () => {
    try { editDraft(bindDiagramToCall(draft, call.callId, currentPlay)); report("ok", "Current diagram bound to this call. Save or freeze to keep it."); } catch (error) { report("error", error.message); }
  };
  const openDiagram = () => {
    try { onOpenDiagram(diagramForCall(shown, call.callId)); } catch (error) { report("error", error.message); }
  };

  const freeze = () => run(async (fresh) => {
    const frozen = await freezeSchemePackage(draft);
    if (fresh()) commit({ ...library, draft: frozen }, `Revision ${frozen.revision} frozen at ${short(frozen.contentDigest)}.`);
  });

  const approve = () => run(async (fresh) => {
    const approved = await approveSchemePackage(draft, { actionKind: LOCAL_TEST_ACTION, actorLabel: "Local test action", confirmedDigest: draft.contentDigest });
    const nextPlan = await planSchemeImport(library, serializeSchemePackage(approved));
    if (!fresh()) return;
    const { receipt, store } = applySchemeImport(library, { plan: nextPlan, confirmedDigest: approved.contentDigest });
    setConfirmingApproval(false);
    if (receipt.status !== "imported") { report("error", `${receipt.message} This revision was not approved.`); return; }
    commit({ ...store, draft: null }, `${LOCAL_TEST_LABEL}: revision ${approved.revision}, ${short(approved.contentDigest)}.`);
  });

  const chooseFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    run(async (fresh) => {
      const text = await file.text();
      if (!fresh()) return;
      const preview = await planSchemeImport(library, text);
      if (fresh()) { setPlan(preview); setMessage(null); }
    });
  };

  const confirmImport = (resolution) => run(async () => {
    const { receipt, store } = applySchemeImport(library, { plan, confirmedDigest: plan.incoming?.contentDigest, resolution });
    if (receipt.status === "refused") { report("error", receipt.message); return; }
    if (store === library || commit(store, receipt.message)) {
      if (plan.incoming && !store.draft) { setSelectedPackageId(plan.incoming.packageId); setSelectedCallId(null); }
      setPlan(null); if (store === library) report("info", receipt.message);
    }
  });

  const chooseCorrection = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    run(async (fresh) => {
      const text = await file.text();
      if (fresh()) setCorrection(readSchemeCorrection(text));
    });
  };

  const applyCorrection = () => run(async () => {
    const { correction: record } = correction;
    if (draft) { report("error", "Finish or clear the open draft first. Nothing was changed."); return; }
    const source = getSchemePackage(library, record.originatingPackageId, record.originatingRevision, record.originatingDigest);
    if (!source) { report("error", "This correction names a revision that is not here. Import that revision first. Nothing was changed."); return; }
    const next = createCorrectionDraft(source, record);
    if (commit({ ...library, draft: next, corrections: [...(library.corrections ?? []), record] }, `Unapproved draft revision ${next.revision} created from the correction.`)) {
      setCorrection(null);
      setSelectedCallId(record.callId);
    }
  });

  return (
    <Modal label="Scheme package" className="scheme-panel" onClose={onClose}>
      <header className="scheme-toolbar">
        <div><small>Coach only · synthetic examples</small><strong>Scheme package</strong></div>
        <span role="status" data-scheme="save-state" className={saveError ? "is-error" : ""}>{saveError ? "Not saved" : unsaved ? "Unsaved changes" : "Saved state shown below"}</span>
        <button type="button" onClick={onClose}>Close</button>
      </header>
      <div className="scheme-body">
        {message ? <p className={`scheme-message is-${message.kind}`} role={message.kind === "error" ? "alert" : "status"} data-scheme="message">{message.text}</p> : null}
        {saveError ? <p className="scheme-message is-error" role="alert">{saveError}</p> : null}
        {!canWrite ? <p className="scheme-message is-error" role="alert">This workspace is read-only, so nothing here can be saved.</p> : null}

        <section className="scheme-section" aria-label="Package files">
          {packageIds.length > 1 ? <label>Package
            <select aria-label="Package" data-scheme="package-select" value={currentPackageId} disabled={Boolean(draft) || busy} onChange={event => { setSelectedPackageId(event.target.value); setSelectedCallId(null); setConfirmingApproval(false); setMessage(null); }}>
              {packageIds.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
            {draft ? <small>Finish the open draft before switching packages.</small> : null}
          </label> : null}
          <div className="scheme-actions">
            <a href="/">Coach home</a><a href="/practice/">Continue in Practice</a><a href="?coach=review">Coach review</a>
            {!draft && !packageIds.length ? <button type="button" disabled={!canWrite || busy} onClick={loadDemo} data-scheme="load-demo">Load synthetic family (Q, show, SIM4, P5)</button> : null}
            {!draft && current ? <button type="button" disabled={!canWrite || busy} onClick={startRevision} data-scheme="new-revision">Start next draft revision</button> : null}
            {editable ? <button type="button" disabled={busy} onClick={() => commit(library, "Draft kept.")} data-scheme="save-draft">Save draft</button> : null}
            <label className="scheme-file">Import package<input type="file" accept=".json,application/json" disabled={!canWrite || busy} onChange={chooseFile} data-scheme="package-file" /></label>
            <label className="scheme-file">Import correction<input type="file" accept=".json,application/json" disabled={!canWrite || busy} onChange={chooseCorrection} data-scheme="correction-file" /></label>
            {import.meta.env.DEV ? <a href="/dev/teaching-harness.html" target="_blank" rel="noreferrer" data-scheme="teaching-harness-link">Open local Teaching harness (development only)</a> : null}
          </div>
        </section>

        {plan ? <ImportPreview plan={plan} busy={busy} onConfirm={confirmImport} onCancel={() => setPlan(null)} /> : null}

        {correction ? (
          <section className="scheme-section scheme-preview" aria-label="Correction preview" data-scheme="correction-preview">
            <h3>Correction preview</h3>
            {correction.ok ? (
              <>
                <p>{correction.correction.observedIssue}</p>
                <p>{`From revision ${correction.correction.originatingRevision}, call ${correction.correction.callId}. Recheck: ${correction.correction.recheckStatus}.`}</p>
                <p>{correction.correction.proposedRuleChange ? `Proposed: ${correction.correction.proposedRuleChange.field} → ${correction.correction.proposedRuleChange.value}` : "No rule change proposed."}</p>
                <div className="scheme-actions">
                  <button type="button" disabled={busy} onClick={applyCorrection} data-scheme="correction-draft">Create new draft revision</button>
                  <button type="button" disabled={busy} onClick={() => setCorrection(null)}>Cancel</button>
                </div>
              </>
            ) : <ul>{correction.errors.map((item, i) => <li key={i} className="is-error">{item.message}</li>)}</ul>}
          </section>
        ) : null}

        {shown ? (
          <>
            <section className="scheme-section" aria-label="Revision" data-scheme="revision">
              <h3>{`${shown.packageId} · revision ${shown.revision}`}</h3>
              <p data-scheme="revision-status">
                {draft ? (draft.frozen ? `Frozen at ${short(draft.contentDigest)}, not approved` : "Draft, not frozen") : `Current: ${short(currentSchemeRef(library, shown.packageId)?.contentDigest)}`}
                {shown.parentDigest ? ` · parent ${short(shown.parentDigest)}` : ""}
              </p>
              <div className="scheme-actions">
                {editable ? <button type="button" disabled={busy || !validation.valid} onClick={freeze} data-scheme="freeze">Freeze this revision</button> : null}
                {draft?.frozen && canWrite ? <button type="button" disabled={busy} onClick={reopenFrozen} data-scheme="reopen">Clear freeze</button> : null}
                {draft?.frozen && canWrite && !confirmingApproval ? <button type="button" disabled={busy} onClick={() => setConfirmingApproval(true)} data-scheme="approve-start">Approve as a local test action…</button> : null}
                {shown.frozen ? <button type="button" onClick={() => { download(coachFileName(shown), serializeSchemePackage(shown)); report("info", "Download requested. Check that the coach-only file arrived."); }} data-scheme="download-coach">Download coach-only JSON</button> : null}
              </div>
              {confirmingApproval ? (
                <div className="scheme-confirm" role="group" aria-label="Confirm local test approval">
                  <p>{`${LOCAL_TEST_LABEL}. This is not the owner’s doctrinal approval. Exact digest: ${draft.contentDigest}`}</p>
                  <button type="button" disabled={busy} onClick={approve} data-scheme="approve-confirm">Approve this exact revision</button>
                  <button type="button" disabled={busy} onClick={() => setConfirmingApproval(false)}>Cancel</button>
                </div>
              ) : null}
            </section>

            <IssueList validation={validation} />
            <AuthorityRecords pkg={shown} />

            <section className="scheme-section" aria-label="Calls">
              <div className="segmented scheme-calls" role="group" aria-label="Call">
                {shown.calls.map((item) => <button key={item.callId} type="button" className={item.callId === call?.callId ? "active" : ""} aria-pressed={item.callId === call?.callId} onClick={() => setSelectedCallId(item.callId)}>{item.learnerContext?.callName ?? item.title}</button>)}
              </div>
              {call ? (
                <>
                  <p data-scheme="call-summary">{`${call.title} · ${call.rushFamily} · ${call.intendedRushCount} rush, ${call.anticipatedCoverageCount} coverage · ${readiness === "ready" ? "Ready" : readiness === "draft" ? "Draft" : "Incomplete"}`}</p>
                  <div className="scheme-actions">
                    {editable ? (
                      <label>Call status
                        <select value={call.status} onChange={(event) => editCall("status", event.target.value)} data-scheme="call-status"><option value="draft">Draft</option><option value="ready">Ready</option></select>
                      </label>
                    ) : null}
                    <button type="button" onClick={openDiagram} disabled={!canWrite} data-scheme="open-diagram">Open diagram in editor</button>
                    {editable ? <button type="button" onClick={bindDiagram} data-scheme="bind-diagram">{`Use current diagram (${currentPlay.name})`}</button> : null}
                  </div>
                  <RoleEditor call={call} base={base} locked={!editable} onRole={editRole} />
                  <section className="scheme-key" aria-label="Private coach key">
                    <h4>{`Private coach key · ${keyStatus}`}</h4>
                    <p data-scheme="key-status">{keyStatus === 'current' ? 'Bound to the reviewed teaching content.' : 'Held for assessment: review the authored answers and explicitly regenerate this key. Old assignments retain their original key.'}</p>
                    {editable && keyRecord ? <>
                      <details><summary>Review authored coach answers</summary>{keyRecord.answers.map(answer => <label key={answer.roleId}>{answer.roleId}<textarea aria-label={`${answer.roleId} authored coach answer`} value={answer.answer ?? ''} onChange={event => editAnswer(answer.roleId, event.target.value)} /></label>)}</details>
                      <button type="button" data-scheme="regenerate-key" disabled={busy} onClick={regenerateKey}>Regenerate this call’s coach key</button>
                    </> : null}
                  </section>
                  {call.exchangeOutcomes.length ? (
                    <div className="scheme-outcomes">
                      <h4>Conditional outcomes</h4>
                      <ul>{call.exchangeOutcomes.map((outcome) => <li key={outcome.outcomeId}><strong>{outcome.condition}</strong>{` · expected ${outcome.expectedRushCount} rush, ${outcome.expectedCoverageCount} coverage · ${outcome.replacementCoverage.map((item) => item.coverage).join("; ")}${call.ambiguousReadDefault === outcome.outcomeId ? " · default when ambiguous" : ""}`}</li>)}</ul>
                    </div>
                  ) : null}
                </>
              ) : null}
            </section>
          </>
        ) : <p className="lesson-pack-empty">No scheme package yet. Load the synthetic family or import a coach-only file.</p>}

        {revisions.length ? (
          <section className="scheme-section" aria-label="Revision history" data-scheme="history">
            <h3>Revision history</h3>
            <ul>
              {revisions.map((record) => (
                <li key={record.contentDigest}>
                  {`Revision ${record.revision} · ${record.lifecycle}${record.current ? " · current" : ""} · ${short(record.contentDigest)} `}
                  <button type="button" onClick={() => download(`coach-scheme-package-${currentPackageId}-r${record.revision}-coach-only.json`, record.text)}>Download</button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
