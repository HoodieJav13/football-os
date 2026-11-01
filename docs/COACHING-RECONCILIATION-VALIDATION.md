# Local reconciliation verification

Baseline: PR #9 `cc7af9a213533061ae4e66143eeafe9cf446dd18`. Application feature source remains byte-identical to the reviewed workspace. Of its 271 pinned source files, only root instructions, README, package scripts and the legacy offline test’s cache-name assertion are adapted. Other additions preserve original repository evidence and provide CI/verification wrappers.

Direct local checks:

- Lesson units: 437 pass and one production-exclusion skip before the build. The three production-exclusion checks pass after the build, including the skipped assertion.
- Practice units: 245 pass. Packet: 148 pass, two retained external frozen-reference skips.
- Existing Sites packaging: 3/3. Original editor and combined production builds pass; non-failing Vite chunk-size advisory remains.
- Full original-editor browser run: 100/101 passed. Its single failure opened the obsolete global cache rather than the reviewed scoped author cache. The corrected offline file passes 3/3, including no readiness claim before assets are cached, no readiness without a worker and actual offline reload. No application or service-worker source was changed.
- Combined root routing/cache checks: 5/5; production harness exclusion: 3/3.
- Actual ordinary-control Author→Practice→Packet→review/correction/reopen journey passes at 1440×900 and390×844, including real file downloads/intake and coach/study/answer-free Identify PDFs.
- Actual scoped service worker preserves an unrelated synthetic cache and leaves Practice/Packet uncontrolled; online404 does not poison offline entry. Additional1194×834 and844×390 layouts pass with44px controls. Three cache/layout checks pass.

The initial cache-link setup build failure and legacy assertion failure remain in local evidence; neither was hidden or treated as a passing run. The first exact-head GitHub CI run (41269725759) passed the complete corrected original-editor browser suite, units, packaging, builds, routing, harness exclusion and the desktop journey. Its phone journey then failed because the existing selected-player bottom sheet covered More. The journey now uses the ordinary Close player inspector control before navigating; no force-click, timeout increase or application change is used. The complete phone and desktop journeys pass locally after that correction. The failed CI run is retained; final exact-head CI is reported on the draft PR, not presumed here. Local browser runs use fresh isolated synthetic contexts and task-owned loopback servers.

Original source HEADs and dirty-file hashes remain unchanged. All original audit/design files and `.npmrc` remain retained. Both active hosting IDs are null. No owner browser store, saves, credentials, deployed Site, old PR or experiment was changed. This is implementer verification plus reused exact-source acceptance; no new independent-review, physical-device, hosted-authenticated or release acceptance is claimed.
