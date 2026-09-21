import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { createAppServer } from '../scripts/serve.mjs';

async function withFixture(localConfig, environment, run) {
  const temporaryRoot = resolve(tmpdir());
  const root = await mkdtemp(join(temporaryRoot, 'steadmorrow-server-'));
  let server;
  try {
    await mkdir(join(root, 'assets'));
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'index.html'), '<h1>Steadmorrow</h1>');
    await writeFile(join(root, 'land.js'), 'export const land = true;');
    await writeFile(join(root, 'assets', 'clip.mp4'), '0123456789');
    await writeFile(join(root, 'assets', 'empty.png'), '');
    await writeFile(join(root, 'docs', 'private.md'), 'not public');
    await writeFile(join(root, 'package.json'), '{"private":true}');
    if (localConfig !== null) await writeFile(join(root, '.env.local'), localConfig);
    server = await createAppServer(root, environment);
    await new Promise(resolveReady => server.listen(0, '127.0.0.1', resolveReady));
    const call = (path, { method = 'GET', headers = {} } = {}) => new Promise((resolveResponse, reject) => {
      const req = request({ hostname:'127.0.0.1', port:server.address().port, path, method, headers }, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolveResponse({ status:response.statusCode, headers:response.headers, body:Buffer.concat(chunks).toString() }));
      });
      req.on('error', reject);
      req.end();
    });
    await run(call);
  } finally {
    if (server) await new Promise(resolveClosed => server.close(resolveClosed));
    if (dirname(root) !== temporaryRoot || !basename(root).startsWith('steadmorrow-server-')) throw new Error('Refusing unexpected fixture cleanup path');
    await rm(root, { recursive:true, force:true });
  }
}

test('missing configuration is explicit, is not cached, and HEAD has no body', async () => {
  await withFixture(null, {}, async call => {
    const result = await call('/api/maps-config');
    assert.equal(result.status, 200);
    assert.deepEqual(JSON.parse(result.body), { apiKey:'', mode:'standard', configured:false });
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.match(result.headers['content-type'], /^application\/json/);
    const head = await call('/api/maps-config', { method:'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    assert.equal(head.headers['content-length'], result.headers['content-length']);
  });
});

test('local Maps settings load, unrelated environment values remain private, and process settings take precedence', async () => {
  const localConfig = '# Test values, never a real credential\r\nGOOGLE_MAPS_API_KEY="fixture-browser-key"\r\nexport GOOGLE_MAPS_KEY_MODE=demo # testing\r\nSERVER_SECRET=fixture-private-value\r\nGLOO_API_KEY=fixture-private-gloo\r\n';
  await withFixture(localConfig, {}, async call => {
    const result = await call('/api/maps-config');
    assert.deepEqual(JSON.parse(result.body), { apiKey:'fixture-browser-key', mode:'demo', configured:true });
    assert.ok(!result.body.includes('fixture-private-value'));
    assert.ok(!result.body.includes('fixture-private-gloo'));
  });
  await withFixture(localConfig, { GOOGLE_MAPS_API_KEY:'fixture-override', GOOGLE_MAPS_KEY_MODE:'standard', SERVER_SECRET:'private' }, async call => {
    assert.deepEqual(JSON.parse((await call('/api/maps-config')).body), { apiKey:'fixture-override', mode:'standard', configured:true });
  });
  await withFixture(localConfig, { GOOGLE_MAPS_API_KEY:'' }, async call => {
    assert.deepEqual(JSON.parse((await call('/api/maps-config')).body), { apiKey:'', mode:'demo', configured:false });
  });
});

test('approved resources support normal, HEAD, range, suffix, and empty responses', async () => {
  await withFixture(null, {}, async call => {
    const home = await call('/?preview=true');
    assert.equal(home.status, 200);
    assert.equal(home.body, '<h1>Steadmorrow</h1>');
    assert.match(home.headers['content-type'], /^text\/html/);
    assert.equal((await call('/land.js')).status, 200);
    const head = await call('/assets/clip.mp4', { method:'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    assert.equal(head.headers['content-length'], '10');
    const range = await call('/assets/clip.mp4', { headers:{ Range:'bytes=2-5' } });
    assert.equal(range.status, 206);
    assert.equal(range.body, '2345');
    assert.equal(range.headers['content-range'], 'bytes 2-5/10');
    assert.equal((await call('/assets/clip.mp4', { headers:{ Range:'bytes=-3' } })).body, '789');
    assert.equal((await call('/assets/clip.mp4', { headers:{ Range:'bytes=6-' } })).body, '6789');
    for (const Range of ['bytes=10-', 'bytes=4-2', 'bytes=-0', 'bytes=0-1,3-4', 'garbage']) {
      const invalid = await call('/assets/clip.mp4', { headers:{ Range } });
      assert.equal(invalid.status, 416, Range);
      assert.equal(invalid.headers['content-range'], 'bytes */10');
    }
    const empty = await call('/assets/empty.png');
    assert.equal(empty.status, 200);
    assert.equal(empty.headers['content-length'], '0');
    assert.equal(empty.body, '');
  });
});

test('private files, dotfiles, traversal, unsupported methods, and malformed escapes cannot be served', async () => {
  await withFixture('GOOGLE_MAPS_API_KEY=fixture-only\n', {}, async call => {
    for (const path of ['/.env.local', '/%2eenv.local', '/assets/../index.html', '/assets/%2e%2e/index.html', '/assets/%2e%2e%2f.env.local', '/assets/..%5c.env.local']) {
      const result = await call(path);
      assert.equal(result.status, 403, path);
      assert.ok(!result.body.includes('fixture-only'));
    }
    for (const path of ['/docs/private.md', '/package.json', '/scripts/serve.mjs', '/tests/server.test.mjs', '/missing.js']) {
      assert.equal((await call(path)).status, 404, path);
    }
    assert.equal((await call('/assets/%ZZ')).status, 400);
    assert.equal((await call('/api/maps-config', { method:'POST' })).status, 405);
  });
});
