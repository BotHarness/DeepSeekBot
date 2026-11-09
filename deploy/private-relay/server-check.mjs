import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createPrivateRelay } from './server.mjs';

test(
  'claim is exclusive, admission is secret, opaque traffic relays, and disconnect closes phone',
  { timeout: 10_000 },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), 'private-relay-'));
    const bootstrap = 'a'.repeat(64),
      ownerToken = 'b'.repeat(64),
      phoneToken = 'c'.repeat(64);
    const relay = createPrivateRelay({ directory, bootstrap });
    const sockets = [];
    try {
      relay.server.listen(0, '127.0.0.1');
      await once(relay.server, 'listening');
      const origin = `http://127.0.0.1:${relay.server.address().port}`;
      const claim = (token, body = { ownerToken, phoneToken }) =>
        fetch(origin + '/claim', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token },
          body: JSON.stringify(body),
        });
      assert.equal((await claim('wrong')).status, 403);
      const competing = await Promise.all([claim(bootstrap), claim(bootstrap)]);
      assert.deepEqual(competing.map((r) => r.status).sort(), [200, 409]);
      assert.equal((await claim(bootstrap)).status, 409);
      assert.equal((await fetch(origin + '/status')).status, 404);
      assert.ok(!readFileSync(join(directory, 'owner.json'), 'utf8').includes(ownerToken));
      const connect = async (route, token, nativeOrigin) => {
        const ws = new WebSocket(origin.replace('http', 'ws') + route, {
          headers: {
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
            ...(nativeOrigin ? { Origin: nativeOrigin } : {}),
          },
        });
        sockets.push(ws);
        await once(ws, 'open');
        return ws;
      };
      await assert.rejects(connect('/host', phoneToken));
      const host = await connect('/host', ownerToken);
      await assert.rejects(connect('/botharness-device/channel', undefined, origin));
      const opening = once(host, 'message');
      const phone = await connect('/botharness-device/channel', phoneToken, origin);
      const opened = JSON.parse((await opening)[0].toString());
      assert.equal(opened.type, 'open');
      const inbound = once(host, 'message');
      phone.send('opaque-noise-frame');
      assert.deepEqual(JSON.parse((await inbound)[0].toString()), {
        type: 'data',
        id: opened.id,
        data: 'opaque-noise-frame',
      });
      const outbound = once(phone, 'message');
      host.send(JSON.stringify({ type: 'data', id: opened.id, data: 'encrypted-reply' }));
      assert.equal((await outbound)[0].toString(), 'encrypted-reply');
      const ended = once(phone, 'close');
      host.close();
      await ended;
    } finally {
      for (const ws of sockets) ws.terminate();
      relay.close();
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test('restart retains first owner and rejects a new claimant', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'private-restart-'));
  const bootstrap = 'a'.repeat(64);
  let relay = createPrivateRelay({ directory, bootstrap });
  try {
    relay.server.listen(0, '127.0.0.1');
    await once(relay.server, 'listening');
    const claim = (port) =>
      fetch(`http://127.0.0.1:${port}/claim`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + bootstrap },
        body: JSON.stringify({ ownerToken: 'b'.repeat(64), phoneToken: 'c'.repeat(64) }),
      });
    assert.equal((await claim(relay.server.address().port)).status, 200);
    const closed = once(relay.server, 'close');
    relay.close();
    await closed;
    relay = createPrivateRelay({ directory, bootstrap });
    relay.server.listen(0, '127.0.0.1');
    await once(relay.server, 'listening');
    assert.equal((await claim(relay.server.address().port)).status, 409);
  } finally {
    relay.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test(
  'v2 serves several Hosts with isolated admission and passes conformance',
  { timeout: 20_000 },
  async () => {
    const { createHash } = await import('node:crypto');
    const { writeFileSync } = await import('node:fs');
    const { runConformance } = await import('./conformance.mjs');
    const { readHostKeys } = await import('./server.mjs');
    const directory = mkdtempSync(join(tmpdir(), 'private-v2-'));
    const keysFile = join(directory, 'keys');
    const keyA = 'd'.repeat(64),
      keyB = 'e'.repeat(64);
    const hash = (value) => createHash('sha256').update(value).digest('hex');
    writeFileSync(keysFile, `office-a ${hash(keyA)}\noffice-b ${hash(keyB)}\n`);
    const options = {
      directory,
      bootstrap: 'a'.repeat(64),
      hostKeys: () => readHostKeys(keysFile),
    };
    let relay = createPrivateRelay(options);
    try {
      relay.server.listen(0, '127.0.0.1');
      await once(relay.server, 'listening');
      const origin = `http://127.0.0.1:${relay.server.address().port}`;
      const lines = [];
      const result = await runConformance({ origin, keyA, keyB, log: (line) => lines.push(line) });
      assert.ok(result.ok, lines.join('\n'));
      const v1 = await fetch(origin + '/claim', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + 'a'.repeat(64) },
        body: JSON.stringify({ ownerToken: 'f'.repeat(64), phoneToken: '1'.repeat(64) }),
      });
      assert.equal(v1.status, 200);
      const stored = readFileSync(join(directory, 'hosts', 'office-b.json'), 'utf8');
      assert.ok(!stored.includes(keyB));
      const closed = once(relay.server, 'close');
      relay.close();
      await closed;
      relay = createPrivateRelay(options);
      relay.server.listen(0, '127.0.0.1');
      await once(relay.server, 'listening');
      const port = relay.server.address().port;
      const replay = await fetch(`http://127.0.0.1:${port}/claim`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + keyA },
        body: JSON.stringify({ ownerToken: '2'.repeat(64), phoneToken: '3'.repeat(64) }),
      });
      assert.equal(replay.status, 409);
      const status = await fetch(`http://127.0.0.1:${port}/status`, {
        headers: { Authorization: 'Bearer ' + 'f'.repeat(64) },
      });
      assert.deepEqual(await status.json(), { connected: false, host: 'default' });
    } finally {
      relay.close();
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test('host key file rejects malformed lines', async () => {
  const { writeFileSync } = await import('node:fs');
  const { readHostKeys } = await import('./server.mjs');
  const directory = mkdtempSync(join(tmpdir(), 'private-keys-'));
  try {
    writeFileSync(join(directory, 'keys'), 'default ' + 'a'.repeat(64));
    assert.throws(() => readHostKeys(join(directory, 'keys')), /host-keys-invalid/u);
    assert.equal(readHostKeys(join(directory, 'missing')).size, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
