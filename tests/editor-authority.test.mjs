import assert from "node:assert/strict";
import test from "node:test";
import { createEditorAuthority, EDITOR_LOCK } from "../src/editorAuthority.js";
import { createDurableStore, RevokedWriteError } from "../src/durableStore.js";
import { WORKSPACE_KEY } from "../src/workspaceData.js";
import { createChannelHub, createLockManager, flush, memoryStorage } from "./fixtures/fake-locks.mjs";

/*
 * The authority in isolation, against a Web Locks model shared by several
 * "tabs". Browser behaviour (real locks, real pages) is covered by
 * tests/browser/multi-tab.test.mjs; these pin the state machine exactly.
 */

function tab(manager, hub, name, { storage, prepare } = {}) {
  const acquired = [];
  const authority = createEditorAuthority({
    locks: manager.client(name),
    createChannel: () => hub.create(),
    setTimer: () => 0,
    clearTimer: () => {},
    tabId: name,
  });
  const store = storage ? createDurableStore({ storage: () => storage, isCurrent: (epoch) => authority.isCurrent(epoch) }) : null;
  const gate = { drafts: [], saveError: null, saves: 0 };
  authority.connect({
    acquire: (epoch) => { acquired.push(epoch); store?.adopt(epoch); },
    prepareHandover: prepare ?? (() => {
      if (gate.drafts.length) return { ok: false, blocked: { kind: "drafts", drafts: gate.drafts } };
      if (gate.saveError) return { ok: false, blocked: { kind: "save", message: gate.saveError } };
      gate.saves += 1;
      return { ok: true };
    }),
  });
  return { authority, acquired, gate, store, name };
}

test("simultaneous startup yields exactly one editor and one viewer", async () => {
  for (let round = 0; round < 20; round += 1) {
    const manager = createLockManager(), hub = createChannelHub();
    const a = tab(manager, hub, "a"), b = tab(manager, hub, "b");
    a.authority.start(); b.authority.start();
    await flush();
    const statuses = [a, b].map((t) => t.authority.getState().status).sort();
    assert.deepEqual(statuses, ["editor", "viewer"]);
    assert.equal(a.acquired.length + b.acquired.length, 1, "only the editor reread storage for editing");
  }
});

test("a request waits for drafts, then hands over; the receiver rereads under a new lease and the old lease cannot write", async () => {
  const storage = memoryStorage({ [WORKSPACE_KEY]: "v1" });
  const manager = createLockManager(), hub = createChannelHub();
  const a = tab(manager, hub, "a", { storage }), b = tab(manager, hub, "b", { storage });
  a.authority.start(); await flush();
  b.authority.start(); await flush();
  const aEpoch = a.authority.getState().epoch;
  assert.equal(a.authority.getState().status, "editor");

  a.gate.drafts = ["Play details for Mesh"];
  b.authority.requestEdit(); await flush();
  assert.equal(b.authority.getState().status, "requesting");
  assert.equal(a.authority.getState().status, "editor", "the editor keeps the lock while a draft is open");
  assert.deepEqual(a.authority.getState().blocked, { kind: "drafts", drafts: ["Play details for Mesh"] });
  assert.deepEqual(b.authority.getState().editorBlocked, { kind: "drafts", drafts: ["Play details for Mesh"] }, "the requester is told why");
  assert.equal(b.acquired.length, 0);

  a.gate.drafts = [];
  a.authority.tryHandover(); await flush();
  assert.equal(a.gate.saves, 1, "the editor saved exactly once before letting go");
  assert.deepEqual([a.authority.getState().status, a.authority.getState().reason], ["viewer", { kind: "handed-over" }]);
  assert.equal(b.authority.getState().status, "editor");
  assert.deepEqual(b.acquired, [1], "the receiver reread storage when the lock was granted");

  assert.equal(a.authority.isCurrent(aEpoch), false);
  assert.throws(() => a.store.transact(aEpoch, (s) => s.setItem(WORKSPACE_KEY, "stale")), RevokedWriteError);
  assert.equal(storage.getItem(WORKSPACE_KEY), "v1");
  b.store.transact(b.authority.getState().epoch, (s) => s.setItem(WORKSPACE_KEY, "v2"));
  assert.equal(storage.getItem(WORKSPACE_KEY), "v2");
});

test("a lost BroadcastChannel message is recovered by polling the lock queue", async () => {
  const manager = createLockManager(), hub = createChannelHub();
  const a = tab(manager, hub, "a"), b = tab(manager, hub, "b");
  a.authority.start(); await flush();
  b.authority.start(); await flush();
  hub.dropping = true;
  b.authority.requestEdit(); await flush();
  assert.equal(a.authority.getState().requested, false, "the editor has not heard the request");
  assert.equal(b.authority.getState().status, "requesting");
  await a.authority.poll(); await flush();
  assert.equal(b.authority.getState().status, "editor");
  assert.equal(a.authority.getState().status, "viewer");
});

test("a failed save keeps the lock with the editor; it hands over once a save succeeds", async () => {
  const manager = createLockManager(), hub = createChannelHub();
  const a = tab(manager, hub, "a"), b = tab(manager, hub, "b");
  a.authority.start(); await flush();
  b.authority.start(); await flush();
  a.gate.saveError = "QuotaExceededError";
  b.authority.requestEdit(); await flush();
  assert.equal(a.authority.getState().status, "editor");
  assert.deepEqual(b.authority.getState().editorBlocked, { kind: "save", message: "QuotaExceededError" });
  for (let i = 0; i < 5; i += 1) { await a.authority.poll(); await flush(); }
  assert.equal(b.authority.getState().status, "requesting", "no timeout steals the lock");
  a.gate.saveError = null;
  await a.authority.poll(); await flush();
  assert.equal(b.authority.getState().status, "editor");
});

test("an owner that dies releases the lock to a queued tab; a passive viewer does not take it", async () => {
  const manager = createLockManager(), hub = createChannelHub();
  const a = tab(manager, hub, "a"), b = tab(manager, hub, "b"), c = tab(manager, hub, "c");
  a.authority.start(); await flush();
  b.authority.start(); c.authority.start(); await flush();
  a.gate.drafts = ["dragging a player"];
  b.authority.requestEdit(); await flush();
  manager.kill("a"); await flush();
  assert.equal(b.authority.getState().status, "editor");
  assert.deepEqual(b.acquired, [1]);
  await c.authority.poll();
  assert.deepEqual([c.authority.getState().status, c.authority.getState().editorPresent], ["viewer", true]);
  manager.kill("b"); await flush();
  await c.authority.poll();
  assert.deepEqual([c.authority.getState().status, c.authority.getState().editorPresent], ["viewer", false], "nobody edits until a tab asks");
});

test("cancelling a request leaves the editor in place and clears its notice", async () => {
  const manager = createLockManager(), hub = createChannelHub();
  const a = tab(manager, hub, "a"), b = tab(manager, hub, "b");
  a.authority.start(); await flush();
  b.authority.start(); await flush();
  a.gate.drafts = ["New play dialog"];
  b.authority.requestEdit(); await flush();
  await a.authority.poll();
  assert.equal(a.authority.getState().requested, true);
  b.authority.cancelRequest(); await flush();
  await a.authority.poll();
  assert.deepEqual([a.authority.getState().status, a.authority.getState().requested, b.authority.getState().status], ["editor", false, "viewer"]);
});

test("without Web Locks the tab fails closed and never acquires", async () => {
  const acquired = [];
  const authority = createEditorAuthority({ locks: undefined, createChannel: () => null, setTimer: () => 0, clearTimer: () => {} });
  authority.connect({ acquire: (epoch) => acquired.push(epoch) });
  authority.start(); await flush();
  authority.requestEdit(); await flush();
  assert.deepEqual([authority.getState().status, acquired.length, authority.isCurrent(1)], ["unsupported", 0, false]);
});

test("a lease the browser no longer reports as held stops writing at once", async () => {
  const storage = memoryStorage({ [WORKSPACE_KEY]: "v1" });
  const manager = createLockManager(), hub = createChannelHub();
  const a = tab(manager, hub, "a", { storage });
  a.authority.start(); await flush();
  const epoch = a.authority.getState().epoch;
  const leaseLock = [...manager.held.keys()].find((name) => name.startsWith(`${EDITOR_LOCK}.lease.`));
  assert.ok(leaseLock, "the editor holds a lease-specific lock");
  manager.held.delete(leaseLock);
  await a.authority.poll();
  assert.deepEqual([a.authority.getState().status, a.authority.getState().reason], ["viewer", { kind: "lost" }]);
  assert.throws(() => a.store.transact(epoch, (s) => s.setItem(WORKSPACE_KEY, "late")), RevokedWriteError);
  assert.equal(storage.getItem(WORKSPACE_KEY), "v1");
});

/* Regressions from the independent review of this change. */

test("a requester that cancelled while the editor was blocked is not handed a lock nobody takes", async () => {
  const manager = createLockManager(), hub = createChannelHub();
  const a = tab(manager, hub, "a"), b = tab(manager, hub, "b");
  a.authority.start(); await flush();
  b.authority.start(); await flush();
  a.gate.drafts = ["Play details for Mesh"];
  b.authority.requestEdit(); await flush();
  await a.authority.poll(); await flush();
  assert.equal(a.authority.getState().requested, true);
  hub.dropping = true; // the cancel message is lost too
  b.authority.cancelRequest(); await flush();
  a.gate.drafts = [];
  a.authority.tryHandover(); await flush();
  assert.deepEqual([a.authority.getState().status, a.gate.saves], ["editor", 0], "A keeps editing; nobody is waiting");
});

test("a tab queued before the current lease began is deferred, not handed the lock the moment the new editor gets it", async () => {
  const manager = createLockManager(), hub = createChannelHub();
  const a = tab(manager, hub, "a"), b = tab(manager, hub, "b"), c = tab(manager, hub, "c");
  a.authority.start(); await flush();
  b.authority.start(); c.authority.start(); await flush();
  a.gate.drafts = ["New play dialog"];
  b.authority.requestEdit(); await flush();
  c.authority.requestEdit(); await flush();
  a.gate.drafts = [];
  await a.authority.poll(); await flush();
  assert.equal(b.authority.getState().status, "editor");
  for (let i = 0; i < 3; i += 1) { await b.authority.poll(); await flush(); }
  assert.deepEqual([b.authority.getState().status, c.authority.getState().status], ["editor", "requesting"], "B keeps the lock it just asked for");
  assert.deepEqual(c.authority.getState().editorBlocked, { kind: "deferred" }, "C is told why");
  c.authority.cancelRequest(); await flush();
  c.authority.requestEdit(); await flush();
  await b.authority.poll(); await flush();
  assert.equal(c.authority.getState().status, "editor", "asking again after B took over is honoured");
});

test("a lost lease also lets go of the editor lock, so neither this tab nor another waits forever", async () => {
  const manager = createLockManager(), hub = createChannelHub();
  const a = tab(manager, hub, "a"), b = tab(manager, hub, "b");
  a.authority.start(); await flush();
  b.authority.start(); await flush();
  const leaseLock = [...manager.held.keys()].find((name) => name.startsWith(`${EDITOR_LOCK}.lease.a.`));
  manager.held.delete(leaseLock);
  await a.authority.poll(); await flush();
  assert.equal(a.authority.getState().reason.kind, "lost");
  assert.equal(manager.held.has(EDITOR_LOCK), false, "the editor lock is free");
  b.authority.requestEdit(); await flush();
  assert.equal(b.authority.getState().status, "editor");
});

test("a lock query answered from before the lease lock was granted is discarded", async () => {
  const manager = createLockManager(), hub = createChannelHub();
  const real = manager.client("a");
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  // The first query is captured now but answered only after the grant.
  let delayed = true;
  const locks = { request: real.request, query: async () => { const snapshot = await real.query(); if (delayed) { delayed = false; await gate; } return snapshot; } };
  const authority = createEditorAuthority({ locks, createChannel: () => hub.create(), setTimer: () => 0, clearTimer: () => {}, tabId: "a" });
  authority.connect({ acquire: () => {}, prepareHandover: () => ({ ok: true }) });
  authority.start();
  const stale = authority.poll();
  await flush();
  release(); await stale; await flush();
  assert.deepEqual([authority.getState().status, authority.getState().reason], ["editor", null]);
});
