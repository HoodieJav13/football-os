# Football OS + Coaching Workspace reconciliation

This branch proposes the combined Coaching Workspace as the source of record in the existing Football OS repository. It descends from PR #9 (`cc7af9a213533061ae4e66143eeafe9cf446dd18`) and retains its full editor under `lesson/`, served at `/author/`. It incorporates the already reviewed workspace once; the 14-file lesson pack is not ported a second time.

Normal routes: `/`, `/author/`, `/practice/`, `/packet/`, `/author/?coach=review`.

Original Football OS audit/design documents remain in their original paths. Its previous root README, instructions, CI and hosting metadata are retained under `docs/football-os-original/`; their release statements are historical. Current CI verifies the original editor and the combined workflow. Root and nested hosting IDs remain null: this PR cannot authorize or execute publication.

See [reconciliation scope, provenance and rollback](docs/COACHING-RECONCILIATION.md). PR #9 stays open pending review of this superseding draft. No merge, deployment, data migration, browser-store reset or adoption of the separate 17-file durability/device-settings experiment is included.

## Verification

```sh
npm ci --prefix lesson
npm run test:unit
npm run test:sites
npm run build:editor
npm run test:browser
npm run build
npm test
npm run test:workflow
```

The component dependencies are unchanged and locked in `lesson/package-lock.json`; Practice and Packet have no runtime dependencies. Browser commands use isolated contexts and task-owned loopback servers. An export/import remains an explicit local file action; browser data does not move between origins automatically.

---

# Coach workspace — private-use release candidate

One local entry connects the accepted Playmaker authoring, integrated Practice/Pilot, Session Packet and completed Teaching models. It uses fictional coaching material only. No login, AI call, database or new dependency is required to use the built app.

## Open the candidate

From this directory, run:

```sh
PORT=43480 node server.mjs
```

Open http://127.0.0.1:43480/. Stop with Ctrl+C. The server binds loopback only and serves only `dist/client`; source, private files and development pages are not served. The delivered archive includes the production build, so no install or build is needed to open it. Node 20+ serves the build; source tests use the existing Node26/TypeScript-stripping environment.

## Normal flow

1. **Author** → More → Scheme package. Load the fictional Q/show/SIM4/P5 family or import a coach package. Review eleven jobs and authored keys; changes hold stale keys until explicit regeneration. Freeze, explicitly approve the local test revision and download coach-only JSON.
2. **Practice** → Data & Save. Preview and import that package. In a day’s Scheme packages section, pin the exact call revision to a period. Pilot copies preserve pins. Export Practice JSON.
3. **Session Packet**. Import Practice JSON and its matching coach package, then choose the exact pinned period. Save/reopen the packet, print coach/study/answer-free Identify output, or export coach-material JSON.
4. **Coach Review**. Import the approved package. Prepare roles1–6 and7–11. The response preview mounts neutral learner data only; it is a coach-only fictional rehearsal, with no player account or live submission endpoint. Record a fictional response, explicitly save a coach review, then separately release reviewed feedback. An imported `reviewed:false` draft remains private until explicitly reviewed. Field observation is a separate recorded action.
5. **Correct and recheck**. Practice exports a proposed correction; Author opens a new unapproved draft. Review its rules/key, freeze and approve explicitly. Import the new revision into Practice/Packet/Review. Older pins, pictures, keys and submitted responses remain unchanged and may show stale. Select the original prepared check and the newer matching call to prepare an authored changed-picture recheck.

Coach Review persists locally, reopens its event history and exports/imports a validated coach-only session archive. Repeats and older archives preserve current history; divergent histories are refused. Another tab’s newer write makes a stale tab read-only. Cancelled file reads cannot commit late. Damaged saved bytes are retained and can be downloaded without rendering unverified data.

## Data boundaries

Each existing tool keeps its existing storage key and file format. Transfers are explicit files; no hidden cross-store sync occurs. Review uses `coaching-workspace:review:v1`; its archive includes frozen private keys and is always coach-only. Package JSON and Packet JSON also contain coach material regardless of the selected print output. Do not distribute those files as learner handouts.

Safe Review writes require the browser Web Locks API; unsupported browsers fail closed and keep existing data. Limits are2MB per package,8MB per session import,12MB per saved workspace,30 sessions,100 package revisions/session and1000 events/session. Browser quota may be smaller; failed writes show Not saved and retain the previously saved review. Imported JSON claims and hashes do not authenticate a human or adopt team doctrine. Known authored private answers/jobs/source identities in learner context hold assessment.

Authoring offline support is confined to `/author/` and its own cache namespace. Neighboring apps and unrelated caches are not controlled or deleted. This does not claim the entire workflow is offline-ready. Existing private Sites, their browser origins and their saves remain separate; there is no automatic migration. No owner-save payload was accessed.

## Source and release boundaries

`lesson/` is the accepted completed lesson/scheme authoring candidate, retaining the separate14-file lesson delta. `practice/` is the accepted integrated Pilot candidate. `packet/` reads legacy v1 and generalized v2. The normal `lesson/src/CoachReview.jsx` and `coachReview.js` reuse completed pure Teaching models under `lesson/src/teaching`; they are not the development harness. Development harness source remains outside production build inputs and is never served.

Root and nested hosting manifests have no Site identity. No FootballOS main/PR9, published Site, access setting or deployment was changed. The combined root is the release target; nested app folders remain source components, not separate publication instructions. Future FootballOS adoption should reconcile this same authoring candidate and its current changes rather than port the lesson delta again.

Build from already available local dependencies with `npm run build`. `npm test` checks root routing/cache rules; each app retains its relevant tests. The immutable manifests, browser/print evidence, independent review and publication/rollback gates are in the accompanying release handoff. Actual Safari/iOS, physical printing and PDF accessibility conformance remain unverified.
