// Practice Week Planner static server. Zero dependencies. Binds 127.0.0.1 only.
// Usage: node server.mjs            (port 4867)
//        PORT=4999 node server.mjs  (override)
// Stop with Ctrl+C (or SIGTERM); the server closes cleanly.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4867);
const HOST = '127.0.0.1';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};
// Only these are served.
const ALLOWED = ['index.html', 'styles.css', 'favicon.svg', 'src/', 'content/'];
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join('; ');

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';
  const rel = path.normalize(urlPath).replace(/^[/\\]+/, '');
  const file = path.join(ROOT, rel);
  const okPath = file.startsWith(ROOT + path.sep) && ALLOWED.some((a) => rel === a || (a.endsWith('/') && rel.startsWith(a)));
  if (!okPath) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
      'content-security-policy': CSP,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is busy. Is the planner already running? Check: lsof -nP -iTCP:${PORT} -sTCP:LISTEN — or start with PORT=<other> node server.mjs`);
  else console.error(e);
  process.exit(1);
});

const shutdown = () => {
  server.close(() => process.exit(0));
  server.closeAllConnections?.(); // do not wait on idle keep-alive sockets
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, HOST, () => {
  // PORT=0 asks the OS for a free port; print the one actually bound.
  const { port } = server.address();
  console.log(`Practice Week Planner (FICTIONAL): http://${HOST}:${port}/  (pid ${process.pid}, Ctrl+C to stop)`);
});
