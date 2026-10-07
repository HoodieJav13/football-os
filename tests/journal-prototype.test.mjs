import assert from "node:assert/strict";
import test from "node:test";
import { commitWithJournal, JOURNAL_KEY, JournalConflictError, recoverJournal } from "../src/journalPrototype.js";
import { memoryStorage } from "./fixtures/fake-locks.mjs";

/*
 * Crash-atomicity prototype (not active in the app). A "crash" here means the
 * process dies after the k-th storage write: later writes never happen. For
 * every k the restarted app must see the complete old state or the complete
 * new state. The same harness shows which crash points leave a mixed state
 * with today's ordered, journal-free writes -- the residual window the
 * prototype exists to close.
 */

const W = "football-os.playbooks.v11", G = "football-os.game-day.v7", R = "football-os.recovery.v1";

class Crash extends Error {}
function crashingAfter(storage, k) {
  let writes = 0;
  const guard = () => { if (writes >= k) throw new Crash(); writes += 1; };
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => { guard(); storage.setItem(key, value); },
    removeItem: (key) => { guard(); storage.removeItem(key); },
  };
}
const snapshot = (storage) => Object.fromEntries([...storage.values.entries()].sort());

const operations = {
  "game-day discard": { before: { [W]: "w-temp", [G]: "g-active" }, writes: [[W, "w-original"], [G, "g-resolved"]] },
  "restore during an adjustment": { before: { [W]: "w-temp", [G]: "g-active" }, writes: [[R, "r-copy"], [G, "g-resolved"], [W, "w-restored"]] },
};

for (const [name, { before, writes }] of Object.entries(operations)) {
  const after = { ...before, ...Object.fromEntries(writes) };

  test(`journal: every crash point of "${name}" recovers to all-old or all-new`, () => {
    const total = writes.length + 2; // journal + applies + journal removal
    for (let k = 0; k <= total; k += 1) {
      const storage = memoryStorage(before);
      try { commitWithJournal(crashingAfter(storage, k), writes, { id: "t", now: () => "t" }); } catch (error) { if (!(error instanceof Crash)) throw error; }
      recoverJournal(storage);
      const state = snapshot(storage);
      assert.ok(
        JSON.stringify(state) === JSON.stringify(snapshot(memoryStorage(before))) || JSON.stringify(state) === JSON.stringify(snapshot(memoryStorage(after))),
        `crash after ${k} writes left ${JSON.stringify(state)}`,
      );
      assert.equal(storage.getItem(JOURNAL_KEY), null);
    }
  });

  test(`today's ordered writes: which crash points of "${name}" leave a mixed state`, () => {
    const mixed = [];
    for (let k = 0; k <= writes.length; k += 1) {
      const storage = memoryStorage(before);
      const crashing = crashingAfter(storage, k);
      try { for (const [key, value] of writes) crashing.setItem(key, value); } catch (error) { if (!(error instanceof Crash)) throw error; }
      const state = JSON.stringify(snapshot(storage));
      if (state !== JSON.stringify(snapshot(memoryStorage(before))) && state !== JSON.stringify(snapshot(memoryStorage(after)))) mixed.push(k);
    }
    assert.deepEqual(mixed, name === "game-day discard" ? [1] : [1, 2]);
  });
}

test("journal replay is refused, and the journal kept, when a key changed outside it", () => {
  const storage = memoryStorage({ [W]: "w0", [G]: "g0" });
  try { commitWithJournal(crashingAfter(storage, 2), [[W, "w1"], [G, "g1"]]); } catch (error) { if (!(error instanceof Crash)) throw error; }
  storage.setItem(G, "someone-else");
  assert.throws(() => recoverJournal(storage), JournalConflictError);
  assert.deepEqual([storage.getItem(W), storage.getItem(G), storage.getItem(JOURNAL_KEY) !== null], ["w1", "someone-else", true]);
});

test("a journal that cannot be written changes nothing", () => {
  const storage = memoryStorage({ [W]: "w0" });
  const full = { getItem: storage.getItem, setItem: () => { throw new Error("QuotaExceededError"); }, removeItem: storage.removeItem };
  assert.throws(() => commitWithJournal(full, [[W, "w1"]]), /Quota/);
  assert.deepEqual(snapshot(storage), { [W]: "w0" });
});
