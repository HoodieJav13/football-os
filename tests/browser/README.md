# Browser tests

These are the only tests that can see a blank screen.

The unit suite (`npm run test:unit`) covers the football model and the
projection maths. `npm run build` proves the bundle compiles. Neither of them
noticed any of these, all of which shipped:

| Failure | What let it through |
| --- | --- |
| A temporal-dead-zone crash rendered an empty field | the build compiled it happily |
| A landscape rule left the Run button with no label and no icon | unit tests, build |
| A focused player token silently swallowed run/pause | unit tests, build |
| Routes revealed as a marching dash pattern instead of drawing | a browser probe that only asked whether an animation *existed* |

That last row is the suite's own failure mode, and worth keeping in mind when
adding to it: **assert the shape of the result, not merely its presence.**

## Running them

```
npm run test:browser     # builds are NOT implicit -- run npm run build first
npm test                 # unit -> sites -> build -> browser, in that order
```

`scripts/with-preview.mjs` serves `dist/` with `vite preview` on a random free
port and passes the URL through `APP_URL`. Serving the built output rather than
the dev server means these tests exercise what actually ships; the random port
means they cannot collide with a dev server you left running.

## Writing them

`harness.mjs` provides `useBrowser()` (per-file browser lifecycle, fresh context
per test so localStorage cannot leak between them) plus helpers phrased the way
a coach would describe the app: `token(page, "X")`, `tokenSpot`, `playClock`,
`waitForIdle`, `currentPlay`.

Every opened app collects console and page errors; call `assertNoErrors()`
before closing when a test exercises a path where a silent throw would matter.

## Multi-tab tests

`multi-tab.test.mjs` and `crash-windows.test.mjs` open genuine same-origin
pages in one browser context (shared localStorage, Web Locks and
BroadcastChannel, like tabs of one profile). Helpers live in `tabs.mjs`.

- **Read durable results from a page that does not run the app.**
  `readDurable` loads `manifest.webmanifest` and reads localStorage, because an
  app page would acquire editing authority and save, changing what it observes.
- **Suspend with the debugger, not the lifecycle API.** CDP
  `Page.setWebLifecycleState({ state: "frozen" })` was measured to be ignored
  for visible headless pages (timers kept ticking), so a test built on it
  proves nothing. `Debugger.pause` stops all of a tab's script while it keeps
  its locks. Closing a paused tab terminates it without `pagehide`.
- **Crash windows are fault injection.** `crash-windows.test.mjs` lets the next
  N Football OS writes through and drops the rest, which is what a restarted
  browser would find had the tab died after write N. Tests needing the
  unapproved redo journal are `todo`: they run and report, but do not fail.
