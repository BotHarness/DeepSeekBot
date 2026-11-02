import { once } from 'node:events';
import { mkdtempSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { expect, it } from 'vitest';
import { rpc } from '../verify-app.mjs';

async function withHost(check) {
  const home = mkdtempSync(join(tmpdir(), 'verify-rpc-'));
  const jar = join(tmpdir(), `dsh-${basename(home)}.cookies`);
  writeFileSync(jar, 'test-session=local-fixture; Path=/');
  const worker = new Worker(
    `const { parentPort } = require('node:worker_threads');
     const { createServer } = require('node:http');
     let requests = 0, commits = 0;
     const server = createServer((req, res) => {
       req.resume();
       req.on('end', () => {
         requests++;
         if (req.url === '/api/test/lost') { commits++; req.socket.destroy(); return; }
         const socket = req.socket;
         res.setHeader('Content-Type', 'application/json');
         res.setHeader('Keep-Alive', 'timeout=60');
         res.end(JSON.stringify({ result: { ok: true, value: { requests, commits } } }));
         setTimeout(() => socket.destroy(), 100).unref();
       });
     });
     server.listen(0, '127.0.0.1', () => parentPort.postMessage(server.address().port));`,
    { eval: true },
  );
  try {
    const [port] = await once(worker, 'message');
    await check({ home, url: `http://127.0.0.1:${port}` });
  } finally {
    await worker.terminate();
    rmSync(jar, { force: true });
    rmdirSync(home);
  }
}

it('can call the Host after the client misses an idle socket close', async () => {
  await withHost(async (instance) => {
    expect(await rpc(instance, 'test/read')).toMatchObject({ requests: 1 });
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
    expect(await rpc(instance, 'test/read')).toMatchObject({ requests: 2 });
  });
});

it('does not repeat a mutation when the response is lost after commit', async () => {
  await withHost(async (instance) => {
    await expect(rpc(instance, 'test/lost')).rejects.toThrow('fetch failed');
    expect(await rpc(instance, 'test/read')).toEqual({ requests: 2, commits: 1 });
  });
});
