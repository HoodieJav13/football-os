# Football OS Project Policy

**Protocol version:** v1.2

Repository-specific policy for agent work on the Football OS coach-facing play
designer. This policy makes the shared protocol concrete without weakening it.

## Autonomy envelope

- Envelope version: 2026-07-31
- Permission posture: bounded local execution
- Tool adapter: Codex desktop with workspace-restricted filesystem and explicit escalation for external actions
- Workspace boundary: this Football OS repository and disposable files under the system temporary directory
- Credential visibility: configured GitHub authentication may be used only for separately authorized remote actions; raw credentials are forbidden
- Missing-envelope behavior: read-only orientation, then stop before mutation

## Authority defaults

- Inspect and test: allowed inside the repository
- Edit: allowed only for a user-approved local implementation scope
- Commit: confirmation required unless the user explicitly includes commit in the active request
- Push: confirmation required unless the user explicitly includes push in the active request
- Merge: owner-only unless explicitly delegated in the active request
- Deploy and hosted mutation: explicit confirmation for the named target and action
- External messages: explicit confirmation
- Destructive history: forbidden

## Commit and delivery conventions

- Preserve unrelated changes and worktrees.
- Build from the exact reviewed branch tip and report divergence from `main`.
- Keep commits focused and stop before committing or publishing unless authorized.
- A successful local build is not a deployment or hosted acceptance.

## Data, authorization, and migration invariants

- Browser workspace data is versioned and migratable; existing user playbooks must survive upgrades.
- Backup restore remains validated and keeps a recovery copy of replaced local data.
- Stable player and assignment identities are independent of coach-visible labels.
- Seed-data changes must not rewrite already-saved user playbooks.
- No authentication, server database, money, PII, or hosted mutation surface currently exists.

## Deployment architecture

- The application is a Vite/React client with the existing Sites worker packaging path.
- Preserve `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs`.
- Run the production build and Sites packaging tests before any delivery checkpoint.

## Product and feature-retirement policy

- The active surface is the coach-first play designer, playbook browser, presentation mode, offline game-day workflow, and local backup/export workflow.
- Player accounts, staff collaboration, cloud synchronization, 3D simulation, and automated PDF import remain deferred unless separately approved.
- Retiring prototype seed content must not delete saved user content.

## Design and visual policy

- Preserve the dark Field Focus anatomy documented in `AGENTS.md`: play-family filmstrip, left tool rail, right inspector, bottom timeline, and field-dominant canvas.
- End Zone remains the default view and phone support prioritizes viewing and quick adjustments.
- Touch targets are at least 44 by 44 CSS pixels; desktop targets are at least 40 by 40 CSS pixels.
- New or materially changed surfaces require desktop, iPad, phone portrait, and phone landscape verification when the layout differs.
- Respect reduced-motion behavior and do not introduce photographic turf, neon HUD styling, or floating controls over active routes.

## Credentials and external systems

- Configured GitHub tooling may inspect remotes when the task requires it.
- Commit, push, deployment, hosted writes, and permission changes require the authority stated above.
- Never print, retrieve, store, or request raw secrets.

## Context documentation

- `AGENTS.md` owns durable Football OS product and interaction decisions.
- `README.md` owns current user-facing capabilities and local verification commands.
- `.agentic/` owns the generated protocol installation and this repository policy.
- Update governing documentation in the same local stage when implementation changes its claims.

## Stop and escalation behavior

- Stop for owner input when football terminology, play truth, or interaction behavior cannot be determined from the approved scope and verified project evidence.
- Stop before any commit, push, merge, deployment, destructive action, dependency addition, or hosted mutation not explicitly authorized.
- Report owner gates as resumable pauses with the concrete decision, evidence, options, and consequences.
