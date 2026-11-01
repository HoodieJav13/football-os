// Local static server for the companion. Serves public/ only, on loopback only.
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_PORT = 4873;
export const HOST = '127.0.0.1';
const PUBLIC_ROOT = fileURLToPath(new URL('./public', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

/** The file for a request path, or null if it is not a servable file under root. */
export function resolveAsset(root, requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://local').pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;
  const relative = pathname === '/' ? 'index.html' : `.${pathname}`;
  const full = path.resolve(root, relative);
  if (!full.startsWith(root + path.sep)) return null;
  return Object.hasOwn(MIME, path.extname(full)) ? full : null;
}

export function createCompanionServer({ root = PUBLIC_ROOT } = {}) {
  return http.createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { ...SECURITY_HEADERS, Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method not allowed\n');
      return;
    }
    const file = resolveAsset(root, req.url);
    try {
      if (!file) throw new Error('not servable');
      const body = await readFile(file);
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME[path.extname(file)], 'Content-Length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found\n');
    }
  });
}

function requestedPort(argv, env) {
  const at = argv.indexOf('--port');
  const raw = at >= 0 ? argv[at + 1] : env.PORT;
  if (raw === undefined) return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid port: ${raw}`);
  return port;
}

const isMain = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = requestedPort(process.argv.slice(2), process.env);
  const server = createCompanionServer();
  server.on('error', (error) => {
    console.error(`Companion server could not start: ${error.message}`);
    process.exit(1);
  });
  server.listen(port, HOST, () => {
    console.log(`Coaching session packet companion (FICTIONAL / REFERENCE): http://${HOST}:${server.address().port}/`);
  });
}
