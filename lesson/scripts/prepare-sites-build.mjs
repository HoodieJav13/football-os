#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const index = path.join(dist, "client", "index.html");
const worker = path.join(root, "worker", "index.js");
const hosting = path.join(root, ".openai", "hosting.json");

for (const file of [index, worker, hosting]) {
  if (!existsSync(file)) throw new Error("Missing Sites build input: " + file);
}

mkdirSync(path.join(dist, "server"), { recursive: true });
mkdirSync(path.join(dist, ".openai"), { recursive: true });
copyFileSync(worker, path.join(dist, "server", "index.js"));
copyFileSync(hosting, path.join(dist, ".openai", "hosting.json"));

/*
 * Verify what was written, not just what was read. Deploying to Sites needs
 * exactly these three paths, and this is the only moment the claim is
 * meaningful -- a test that asserts it before the build passes or fails on
 * whether a stale dist/ happens to be lying around.
 */
const artifacts = [index, path.join(dist, "server", "index.js"), path.join(dist, ".openai", "hosting.json")];
for (const file of artifacts) {
  if (!existsSync(file)) throw new Error("Missing Sites build output: " + file);
}

console.log("Prepared Sites build: dist/server/index.js and dist/.openai/hosting.json");
