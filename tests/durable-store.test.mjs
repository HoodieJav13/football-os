import assert from "node:assert/strict";
import test from "node:test";
import { createDurableStore, OutOfBandWriteError, RevokedWriteError } from "../src/durableStore.js";
import { RECOVERY_WORKSPACE_KEY, WORKSPACE_KEY } from "../src/workspaceData.js";
import { GAME_DAY_KEY } from "../src/workspaceStorage.js";
import { memoryStorage } from "./fixtures/fake-locks.mjs";

function setup(initial = {}) {
  const storage = memoryStorage(initial);
  let current = 1;
  const store = createDurableStore({ storage: () => storage, isCurrent: (epoch) => epoch === current });
  return { storage, store, revoke: () => { current = 0; } };
}

test("writes need the lease the data was adopted under", () => {
  const { storage, store, revoke } = setup({ [WORKSPACE_KEY]: "a" });
  assert.throws(() => store.transact(1, (s) => s.setItem(WORKSPACE_KEY, "b")), RevokedWriteError, "nothing adopted yet");
  store.adopt(1);
  assert.throws(() => store.transact(0, (s) => s.setItem(WORKSPACE_KEY, "b")), RevokedWriteError, "view-only epoch");
  store.transact(1, (s) => s.setItem(WORKSPACE_KEY, "b"));
  revoke();
  assert.throws(() => store.transact(1, (s) => s.setItem(WORKSPACE_KEY, "c")), RevokedWriteError, "revoked lease");
  assert.equal(storage.getItem(WORKSPACE_KEY), "b");
});

test("unknown keys are refused", () => {
  const { store } = setup();
  store.adopt(1);
  assert.throws(() => store.transact(1, (s) => s.setItem("football-os.playbooks.v10", "x")), /Refusing to write/);
});

test("an out-of-band write, legacy keys included, stops the transaction before anything is written", () => {
  for (const key of [WORKSPACE_KEY, GAME_DAY_KEY, "football-os.playbooks.v10"]) {
    const { storage, store } = setup({ [WORKSPACE_KEY]: "w0", [GAME_DAY_KEY]: "g0" });
    store.adopt(1);
    storage.setItem(key, "foreign");
    assert.deepEqual(store.drift(1), [key]);
    assert.throws(() => store.transact(1, (s) => { s.setItem(WORKSPACE_KEY, "w1"); s.setItem(GAME_DAY_KEY, "g1"); }), OutOfBandWriteError);
    assert.equal(storage.getItem(key), "foreign", "the foreign bytes are untouched");
    assert.equal(storage.getItem(WORKSPACE_KEY), key === WORKSPACE_KEY ? "foreign" : "w0");
    assert.equal(storage.getItem(GAME_DAY_KEY), key === GAME_DAY_KEY ? "foreign" : "g0");
  }
});

test("a failing later write puts earlier writes back", () => {
  const { storage, store } = setup({ [WORKSPACE_KEY]: "w0" });
  store.adopt(1);
  const setItem = storage.setItem;
  storage.setItem = (key, value) => { if (key === GAME_DAY_KEY) throw new Error("QuotaExceededError"); setItem(key, value); };
  assert.throws(() => store.transact(1, (s) => { s.setItem(WORKSPACE_KEY, "w1"); s.setItem(GAME_DAY_KEY, "g1"); }), /Quota/);
  assert.deepEqual([storage.getItem(WORKSPACE_KEY), storage.getItem(GAME_DAY_KEY)], ["w0", null]);
  storage.setItem = setItem;
  store.transact(1, (s) => s.setItem(WORKSPACE_KEY, "w2"));
  assert.equal(storage.getItem(WORKSPACE_KEY), "w2", "the store still matches storage after a rollback");
});

test("a rollback that itself fails names the keys left changed", () => {
  const { storage, store } = setup({ [WORKSPACE_KEY]: "w0", [RECOVERY_WORKSPACE_KEY]: "r0" });
  store.adopt(1);
  const setItem = storage.setItem;
  let fail = false;
  storage.setItem = (key, value) => { if (fail) throw new Error("QuotaExceededError"); setItem(key, value); if (key === RECOVERY_WORKSPACE_KEY) fail = true; };
  let caught;
  try { store.transact(1, (s) => { s.setItem(RECOVERY_WORKSPACE_KEY, "r1"); s.setItem(WORKSPACE_KEY, "w1"); }); } catch (error) { caught = error; }
  assert.deepEqual(caught.partialKeys, [RECOVERY_WORKSPACE_KEY]);
  assert.equal(storage.getItem(RECOVERY_WORKSPACE_KEY), "r1");
  storage.setItem = setItem;
  assert.deepEqual(store.drift(1), [], "the store knows what is really stored");
});

test("unchanged values are not rewritten", () => {
  const { storage, store } = setup({ [WORKSPACE_KEY]: "same" });
  store.adopt(1);
  let writes = 0;
  const setItem = storage.setItem;
  storage.setItem = (key, value) => { writes += 1; setItem(key, value); };
  store.transact(1, (s) => s.setItem(WORKSPACE_KEY, "same"));
  assert.equal(writes, 0);
});
