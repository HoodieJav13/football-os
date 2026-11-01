import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import { HOST, createCompanionServer } from '../server.mjs';

let server;
let port;

before(async () => {
  server = createCompanionServer();
  await new Promise((resolve) => { server.listen(0, HOST, resolve); });
  ({ port } = server.address());
});

after(async () => {
  await new Promise((resolve) => { server.close(resolve); });
});

// Raw request, because fetch would normalize the traversal paths under test.
function request(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: HOST, port, path, method }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('the companion page and modules are served with local-only policy', async () => {
  const page = await request('/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /text\/html/);
  assert.match(page.body, /Coaching session packet/);
  assert.match(page.headers['content-security-policy'], /connect-src 'none'/);
  assert.equal(page.headers['x-content-type-options'], 'nosniff');
  const script = await request('/src/main.js');
  assert.equal(script.status, 200);
  assert.match(script.headers['content-type'], /text\/javascript/);
  assert.equal((await request('/styles.css')).status, 200);
});

test('nothing outside public/ is reachable', async () => {
  for (const path of [
    '/../server.mjs', '/..%2fserver.mjs', '/%2e%2e/server.mjs', '/%2e%2e%2fpackage.json', '/src/../../package.json',
    '/../../CONTRACT.md', '/src%00.js', '/missing.js', '/src', '/%E0%A4%A',
  ]) {
    const response = await request(path);
    assert.equal(response.status, 404, path);
    assert.doesNotMatch(response.body, /createCompanionServer|"scripts"/, path);
  }
});

test('only GET and HEAD are accepted', async () => {
  assert.equal((await request('/', 'POST')).status, 405);
  assert.equal((await request('/', 'PUT')).status, 405);
  const head = await request('/', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
});
