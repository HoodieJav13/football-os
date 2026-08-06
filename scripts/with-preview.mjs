import { spawn } from "node:child_process";
import { createServer } from "node:net";

/**
 * Runs a command against a freshly served production build.
 *
 * The browser suite needs the app on a URL. Serving `dist/` through `vite
 * preview` rather than the dev server means the tests exercise what actually
 * ships -- minified, with the real bundle -- which is where a build-only
 * failure would surface. The port is chosen at runtime so a dev server already
 * running on 5173 (or a parallel CI job) cannot collide with it, and the URL is
 * handed to the child through APP_URL.
 *
 *   node scripts/with-preview.mjs node --test tests/browser/*.test.mjs
 */

const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.on("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`preview server did not answer at ${url} within ${timeoutMs}ms`);
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("usage: node scripts/with-preview.mjs <command> [args...]");
  process.exit(2);
}

const port = await freePort();
const url = `http://127.0.0.1:${port}/`;

const server = spawn(
  "npx",
  ["vite", "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
  { stdio: ["ignore", "ignore", "inherit"] },
);

let stopped = false;
const stopServer = () => {
  if (stopped) return;
  stopped = true;
  server.kill("SIGTERM");
};
process.on("exit", stopServer);
process.on("SIGINT", () => { stopServer(); process.exit(130); });
process.on("SIGTERM", () => { stopServer(); process.exit(143); });

try {
  await waitForServer(url);
} catch (error) {
  stopServer();
  console.error(String(error));
  process.exit(1);
}

const child = spawn(command, args, {
  stdio: "inherit",
  env: { ...process.env, APP_URL: url },
});

child.on("exit", (code, signal) => {
  stopServer();
  process.exit(signal ? 1 : code ?? 1);
});
