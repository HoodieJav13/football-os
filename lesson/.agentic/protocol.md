# Loop Protocol — v1.2

Canonical shared interface for CVF agent work. Strategists, executors,
reviewers, orchestrators, and evidence-gated delivery all consume this
protocol; none may redefine its shared concepts.

An exact generated copy at `.agentic/protocol.md` governs a wired repository
together with that repository's `.agentic/PROJECT_POLICY.md` and any explicitly
approved `.agentic/PROTOCOL_OVERRIDE.md`.

## Precedence and consumers

Follow the host system's instruction hierarchy. Within the layer this protocol
can govern:

1. repository policy may make protocol defaults more restrictive or resolve a
   repository-specific choice;
2. an explicit task authority grant may override a default only when
   higher-level instructions permit it; and
3. no local file, tool mode, parent agent, sibling agent, reviewer, or
   orchestrator may weaken a safety control or resolve an owner decision.

`orchestrated-build-loop` and `evidence-gated-delivery` remain separate
capabilities. They share the roles, modes, authority ledger, stop conditions,
completion axes, evidence labels, failure classifications, and handoff envelope
defined here.

## Installation, drift, and fallback

### Installed copy

A wired repository contains:

```text
.agentic/
├── protocol.md
├── EXECUTOR.md
├── PROJECT_POLICY.md
├── protocol-installation.yml
└── validate-contract-version.sh
```

The canonical source is `career-os/protocol/protocol.md`. Installation copies
the canonical protocol exactly and records its SHA-256 digest. Editing the
installed copy directly is drift and must fail validation.

Repository-specific rules belong in `PROJECT_POLICY.md`. A true protocol
override is exceptional and must be an additive amendment in
`PROTOCOL_OVERRIDE.md`, with the base protocol version, owner approval, date,
reason, and exact affected clause. The canonical installed copy remains
unchanged.

### Missing protocol

If `.agentic/protocol.md` is absent:

1. read-only orientation may continue;
2. locate the canonical protocol through the repository's declared source or
   the `career-os` repository;
3. do not edit, commit, push, deploy, mutate hosted state, or start unattended
   work until the protocol and project policy are installed and validated; and
4. if the canonical source is unavailable, report
   `outcome: blocked-environment` at `delivery_depth: snapshot-valid` and ask
   for installation or access.

Absence is never permission inherited from a tool's defaults.

### Mismatch or drift

If version markers disagree, the recorded digest differs, an undeclared
override exists, or the validator fails:

1. stop before mutation;
2. preserve the raw validator output;
3. report `outcome: blocked-environment`;
4. do not silently copy whichever version is convenient; and
5. reconcile through the canonical installer or an owner-approved override.

## Roles

- **Owner** (human): product and business decisions, legal decisions, raw
  credentials and account ownership, hosted mutation authorization,
  irreversible actions, cold visual reads, and merge authority unless
  explicitly delegated.
- **Strategist**: scopes work, records the authority ledger, writes executable
  prompts, and independently verifies completion claims against evidence.
- **Executor**: implements an approved bounded scope and reports evidence.
- **Independent reviewer**: derives risks and checks without implementer
  anchoring when the active evaluation requires blindness, then verifies the
  exact delivered head.
- **Orchestrator**: routes work and evidence. It may not answer an owner gate.

Roles are phases, not proof of independence. A single agent playing multiple
roles must reopen the actual diff and raw outputs during verification.
Independent review may be claimed only when the active evaluation demonstrates
the required separation.

## Operating modes

Every run declares exactly one:

- **`DIAL: REVIEW + PROPOSE`** — read-only findings or planning. No repository
  or external-state changes.
- **`DIAL: EXECUTE`** — inspect, implement, and verify inside approved scope.
- **`DIAL: AUDIT + FIX`** — create a findings ledger, then fix verified
  findings. Requires explicit authorization for the combined loop.

## Per-action authority ledger

Record every applicable action before work as `allowed`, `confirmation`, or
`forbidden`, with the source of that status:

```yaml
authority:
  inspect:
    status: allowed
    source: repository policy
  edit:
    status: allowed
    source: owner-approved stage
  test:
    status: allowed
    source: repository policy
  commit:
    status: confirmation
    source: repository policy
  push:
    status: confirmation
    source: repository policy
  merge:
    status: confirmation
    source: owner-reserved action
  deploy:
    status: confirmation
    source: protocol default
  hosted_mutation:
    status: confirmation
    source: protocol default
  hosted_migration:
    status: confirmation
    source: protocol default
  external_message:
    status: confirmation
    source: protocol default
  configured_credentials:
    status: confirmation
    source: protocol default
  raw_credentials:
    status: forbidden
    source: protocol default
  destructive_history:
    status: forbidden
    source: protocol default
```

The example is a conservative fallback, not an edit grant. Populate it from the
current request, the approved autonomy envelope, and repository policy.

Configured authenticated tooling may be used only for an allowed action.
Never reveal, print, copy, store, retrieve, or rotate raw secrets. A tool
permission prompt answers whether a process may perform an action without
another click; it does not grant protocol authority.

## Stop conditions

Stop decision-dependent work when:

- a raw credential is exposed or apparently required;
- requirements cannot all hold;
- a product, business, policy, legal, scope, acceptance, architecture, schema,
  dependency, security, money, PII, or external-state decision exceeds the
  approved task;
- legal or liability text must be invented or changed;
- an action is `confirmation` or `forbidden`;
- an undeclared repository lacks an approved autonomy envelope;
- protocol installation is missing, mismatched, or drifting; or
- the active evaluation's independence or containment conditions cannot be
  demonstrated.

A small correction may proceed without a round trip only when all are true:

- it preserves acceptance criteria and user-visible behavior;
- it adds no public interface, dependency, migration, or external action;
- it stays inside named files or surfaces and is readily reversible;
- it has no meaningful tradeoff; and
- it is disclosed in the handoff.

Otherwise, even a better approach is a stop condition.

### Owner-gate non-delegation

Owner gates are resumable pauses, not failures.

When an owner decision is reached:

1. stop all decision-dependent work;
2. emit `outcome: blocked-decision` with the question, directly verified
   evidence, options, and consequences;
3. the orchestrator may summarize and route the gate;
4. no parent, sibling, reviewer, alternate model, or orchestration layer may
   answer for the owner;
5. actions independent of the decision may continue only when their
   independence is explicit and safe; and
6. resume decision-dependent work only after the owner's decision is recorded.

Absorbing a gate inside an agent-to-agent handoff is an authority-boundary
violation.

## Completion axes

Every report declares exactly one value on each independent axis:

```yaml
outcome: complete | partial | blocked-decision | blocked-environment | verification-failed
delivery_depth: snapshot-valid | locally-complete | committed | published | accepted
```

### Outcome

- **`complete`** — the approved scope and required verification for the stated
  delivery depth are complete.
- **`partial`** — approved implementation remains incomplete for a reason not
  represented by another outcome.
- **`blocked-decision`** — an owner decision or authority grant is required.
- **`blocked-environment`** — access, tooling, service, protocol installation,
  or environment prevents required progress.
- **`verification-failed`** — implementation or delivery may exist, but a
  required check failed or evidence does not support acceptance.

### Delivery depth

- **`snapshot-valid`** — evidence is valid only for the declared observed or
  test baseline. Read-only work normally ends here. A divergent snapshot is
  reconciliation-required.
- **`locally-complete`** — approved local scope is verified against the declared
  integration target; external delivery is not implied.
- **`committed`** — the locally complete state is committed at the reported
  head. Remote branch state is reported separately.
- **`published`** — an approved deployment, hosted schema/data change, or other
  target-environment delivery occurred and its immediate structural checks
  passed; a pushed code branch alone remains `committed`, and behavioral
  acceptance is not implied.
- **`accepted`** — required behavioral, authorization, live-flow, cleanup, and
  evidence gates passed in the target environment.

The axes never round each other up. Examples:

```yaml
outcome: verification-failed
delivery_depth: published
```

```yaml
outcome: blocked-decision
delivery_depth: committed
```

### v1.1 compatibility

| Protocol v1.1 report | Protocol v1.2 translation |
|---|---|
| `COMPLETE-LOCAL` | `complete` + `locally-complete` |
| `COMPLETE` after commit/push | `complete` + `committed` |
| Hosted delivery awaiting behavioral checks | `complete` + `published` |
| Fully verified target behavior | `complete` + `accepted` |
| `VERIFICATION-FAILED` after deployment | `verification-failed` + `published` |
| `BLOCKED-DECISION` | `blocked-decision` + achieved delivery depth |
| `BLOCKED-ENVIRONMENT` | `blocked-environment` + achieved delivery depth |
| `PARTIAL` | `partial` + achieved delivery depth |

Do not rewrite historical v1.1 evidence. Translate it when comparing reports.

## Handoff envelope

Open every completion, pause, or failure report with:

```text
Outcome:               <one outcome>
Delivery depth:        <one delivery depth>
Protocol version:      v1.2
Test baseline:         <SHA/state>
Integration target:    <SHA/branch/state and relationship to baseline>
Head SHA:              <tip commit, or unchanged baseline>
Branch and upstream:   <branch -> remote/branch, or NOT PUSHED>
Authority used:        <actions performed and grant source>
Commits:               <hash — one-line summary, or none>
Files changed:         <count + full list or diffstat>
Migrations/deps:       <new/changed items, or none>
Checks passed:         <named checks with counts>
Checks failed/not run: <each with classification>
External actions:      <pushes, deploys, hosted writes, messages, or none>
Known gaps:            <skipped items, deferrals, or findings>
Push/deploy state:     <exactly what is where>

Measurements:
  Elapsed time:        <wall clock>
  Manual review time:  <minutes>
  Additional findings: <issues found after automation>
  Model/tool cost:     <tokens, credits, or dollar estimate>
  Machine pressure:    <none|low|moderate|high + observed constraint>

Owner interactions:
  Required decision gates:   <count + reason/category>
  Avoidable transport steps: <count + description>
  Unplanned corrections:     <count + description>

Independence:
  Blind phase valid:         <yes|no|not applicable>
  Cross-agent leakage:       <none or evidence>
```

Number every judgment call, deviation, and allowed small correction. Explain
its reasoning. An undisclosed judgment call is a defect.

Required decision gates are healthy safety events. Track repeated identical
gates as possible standing-policy candidates; never reduce the count by
silently answering them. Only avoidable transport and unplanned corrections
are direct reduction targets.

## Failure and non-run classification

Classify every failed or unrun check:

- **`introduced`** — caused by this change.
- **`baseline-relevant`** — pre-existing and capable of affecting acceptance.
- **`baseline-unrelated`** — pre-existing and outside changed behavior.
- **`unavailable`** — blocked by environment, service, credentials, or tooling.
- **`not-applicable`** — intentionally omitted with a concrete reason.

## Evidence labels

Label the basis of each verification claim:

- **`directly verified`** — checked firsthand against repository state, runtime,
  or raw output.
- **`reported only`** — taken from another report with proportional rationale.
- **`inferred`** — reasoned from adjacent verified facts.
- **`not run`** — paired with a failure/non-run classification.

Independent review reports its evidence separately from automated evidence.
Owner decisions are recorded separately from both.

## Regression and verification

Add the smallest practical regression that would have caught a fixed defect. If
automation is disproportionate or impossible, explain why and provide a
reproducible manual check. Include negative-path assertions proportional to
risk.

Verification depth follows the evidence-gated delivery matrix. Money,
authentication, authorization/RLS, PII, migrations, concurrency, correction
authority, novel architecture, and shared primitives always retain independent
review proportional to their blast radius.

---

**v1.2** — separated outcome from delivery depth; canonicalized evidence
labels, per-action authority with sources, owner-gate non-delegation, missing
and mismatched protocol behavior, distribution rules, measurement fields, and
independence reporting; connected orchestration and evidence-gated delivery to
one shared interface.

**v1.1** — clarified precedence; made the ledger per-action and conservative;
made the small-fix allowance deterministic; separated local completion,
decision/environment blocking, and verification failure; expanded baseline
classification; added protocol version and authority source to the envelope.

**v1.0** — initial canonical interface.
