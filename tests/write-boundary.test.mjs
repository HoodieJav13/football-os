import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";

/*
 * The enforceable boundary: only src/durableStore.js holds a writable handle
 * to localStorage. workspaceStorage.js writes only through the storage object
 * it is handed (the store passes a guarded one), and the journal prototype is
 * not reachable from the app until its migration is approved.
 */

const dir = new URL("../src/", import.meta.url);
const sources = Object.fromEntries(readdirSync(dir).filter((f) => /\.(js|jsx)$/.test(f)).map((f) => [f, readFileSync(new URL(f, dir), "utf8")]));

test("only the durable store writes browser storage", () => {
  const offenders = [];
  for (const [file, text] of Object.entries(sources)) {
    if (file === "durableStore.js" || file === "journalPrototype.js") continue;
    if (/(localStorage|sessionStorage)\s*\.\s*(setItem|removeItem|clear)\b/.test(text)) offenders.push(`${file}: direct localStorage write`);
    if (/\bindexedDB\b/.test(text)) offenders.push(`${file}: indexedDB`);
    // Elsewhere a write may only be made on the guarded handle the store passes
    // into a transaction (or, in workspaceStorage.js, on its `storage` parameter).
    const allowed = file === "workspaceStorage.js" ? ["storage"] : ["guarded"];
    for (const [, receiver] of text.matchAll(/([\w$\].)]+)\s*\.\s*(?:setItem|removeItem)\s*\(/g)) {
      if (!allowed.includes(receiver)) offenders.push(`${file}: ${receiver}.setItem/removeItem`);
    }
  }
  assert.deepEqual(offenders, []);
  assert.doesNotMatch(sources["workspaceStorage.js"], /window\s*\.\s*localStorage\s*\.\s*(setItem|removeItem)/);
  assert.doesNotMatch(sources["workspaceStorage.js"].match(/export const browserStorage[\s\S]*?\}\);/)[0], /setItem|removeItem/, "the shared reader is read-only");
});

test("the journal prototype is not wired into the app", () => {
  for (const [file, text] of Object.entries(sources)) {
    if (file === "journalPrototype.js") continue;
    assert.doesNotMatch(text, /journalPrototype/, `${file} imports the unapproved journal`);
  }
});
