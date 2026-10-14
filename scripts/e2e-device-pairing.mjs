import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const home = flag('--home');
const port = flag('--port');
assert.ok(home && port, 'usage: e2e-device-pairing.mjs --home <dir> --port <n>');
const base = `http://127.0.0.1:${port}`;

function launch() {
  return new Promise((resolveLaunch, reject) => {
    const child = spawn(
      process.execPath,
      [join(root, 'scripts/dev-instance.mjs'), '--home', home, '--port', port, '--json'],
      { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] },
    );
    let out = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.on('exit', (code) => {
      if (code !== 0) return reject(new Error(`dev-instance exited ${code}`));
      const summary = JSON.parse(out);
      resolveLaunch({ pid: summary.pid, url: summary.url, log: summary.log });
    });
  });
}

async function stop(pid) {
  process.kill(pid, 'SIGTERM');
  for (let i = 0; i < 100; i += 1) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  process.kill(pid, 'SIGKILL');
}

async function operator(url) {
  const response = await fetch(url, { redirect: 'manual' });
  return response.headers
    .getSetCookie()
    .map((entry) => entry.split(';')[0])
    .join('; ');
}

const envelope = (method) =>
  JSON.stringify({
    type: 'client-request',
    rpcId: crypto.randomUUID(),
    method,
    payload: { args: {} },
  });

async function deviceCall(credential) {
  const response = await fetch(`${base}/botharness-device/api/botharness/list`, {
    method: 'POST',
    headers: { authorization: `Device ${credential}`, 'content-type': 'application/json' },
    body: envelope('botharness/list'),
  });
  const body = await response.json();
  return response.status === 200
    ? { status: 200, ok: body.result?.ok, bots: body.result?.value?.bots?.length }
    : { status: response.status, code: body.code };
}

function deviceStream(credential) {
  return new Promise((resolveStream) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/botharness-device/api/remote.mux`, {
      headers: { authorization: `Device ${credential}`, origin: base },
    });
    const events = [];
    let firstItem;
    const ready = new Promise((r) => (firstItem = r));
    socket.addEventListener('open', () => {
      events.push('open');
      socket.send(
        JSON.stringify({
          type: 'open',
          streamId: 's1',
          endpoint: 'botharness/followRoster',
          payload: { args: {} },
        }),
      );
    });
    socket.addEventListener('message', (message) => {
      const frame = JSON.parse(String(message.data));
      events.push(`frame:${frame.type}`);
      if (frame.type === 'item') firstItem(true);
    });
    const closed = new Promise((r) => {
      socket.addEventListener('close', (event) => {
        events.push(`closed:${event.code}`);
        firstItem(false);
        r(event.code);
      });
      socket.addEventListener('error', () => events.push('error'));
    });
    resolveStream({ socket, events, ready, closed });
  });
}

async function tailnetCall(credential) {
  const { request } = await import('node:http');
  return new Promise((resolveCall, reject) => {
    const req = request({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: '/botharness-device/api/botharness/list',
      headers: {
        host: 'studio.example-tailnet.ts.net',
        authorization: `Device ${credential}`,
        'content-type': 'application/json',
      },
    });
    req.on('response', (res) => {
      res.resume();
      resolveCall({ status: res.statusCode });
    });
    req.on('error', reject);
    req.end(envelope('botharness/list'));
  });
}

async function refusedUpgrade(credential) {
  const { request } = await import('node:http');
  return new Promise((resolveUpgrade, reject) => {
    const req = request({
      host: '127.0.0.1',
      port,
      path: '/botharness-device/api/remote.mux',
      headers: {
        authorization: `Device ${credential}`,
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'sec-websocket-version': '13',
      },
    });
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolveUpgrade({ status: res.statusCode });
    });
    req.on('response', (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolveUpgrade({ status: res.statusCode, code: JSON.parse(body).code }));
    });
    req.on('error', reject);
    req.end();
  });
}

const proof = [];
const step = (name, value) => {
  proof.push({ step: name, ...value });
  console.log(name.padEnd(36), JSON.stringify(value));
};

let host = await launch();
let credential;
try {
  let cookie = await operator(host.url);
  const offerResponse = await fetch(`${base}/api/botharness/devices/offer`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ origin: base }),
  });
  const offerView = await offerResponse.json();
  const payload = JSON.parse(
    Buffer.from(new URL(offerView.link).searchParams.get('p'), 'base64url').toString(),
  );
  step('offer created', { status: offerResponse.status, routes: payload.routes.length });

  const redeem = (offer) =>
    fetch(`${base}/botharness-device/pair`, {
      method: 'POST',
      body: JSON.stringify({ offer, name: 'E2E phone' }),
    });
  const paired = await redeem(payload.offer);
  const pairedBody = await paired.json();
  credential = pairedBody.credential;
  step('offer redeemed', {
    status: paired.status,
    hostMatches: pairedBody.host.id === payload.host.id,
  });
  const again = await redeem(payload.offer);
  step('same offer again', { status: again.status, code: (await again.json()).code });
  step('device call before restart', await deviceCall(credential));

  await stop(host.pid);
  host = await launch();
  step('Host restarted', { tokenRotated: true });
  step('device call after restart', await deviceCall(credential));

  step('device call under a tailnet Host name', await tailnetCall(credential));
  const live = await deviceStream(credential);
  step('device stream after restart', { firstItem: await live.ready });

  cookie = await operator(host.url);
  const list = await (
    await fetch(`${base}/api/botharness/devices`, { headers: { cookie } })
  ).json();
  const device = list.devices.find((entry) => entry.id === pairedBody.deviceId);
  step('paired devices list', { name: device?.name, lastSeen: device?.lastSeenAt !== undefined });

  const revoke = await fetch(`${base}/api/botharness/devices/revoke`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId: pairedBody.deviceId }),
  });
  step('revoke', await revoke.json());
  step('open stream after revoke', { closeCode: await live.closed });
  step('device call after revoke', await deviceCall(credential));
  step('device upgrade after revoke', await refusedUpgrade(credential));
  const operatorCall = await fetch(`${base}/api/botharness/list`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: envelope('botharness/list'),
  });
  step('operator call after revoke', { status: operatorCall.status });
} finally {
  await stop(host.pid);
}

const secret = credential.split('.')[1];
const hostLog = readFileSync(host.log, 'utf8');
const logs = new DatabaseSync(join(home, 'botharness', 'logs.db'), { readOnly: true });
const rows = logs
  .prepare("SELECT kind, detail FROM log_entries WHERE plugin = 'device-pairing' ORDER BY id")
  .all();
logs.close();
step('credential absent from Host log', { absent: !hostLog.includes(secret) });
step('credential absent from developer log', {
  absent: !JSON.stringify(rows).includes(secret),
  kinds: [...new Set(rows.map((row) => row.kind))],
});

const expect = Object.fromEntries(proof.map((entry) => [entry.step, entry]));
assert.equal(expect['offer redeemed'].status, 200);
assert.equal(expect['same offer again'].code, 'offer-invalid');
assert.equal(expect['device call after restart'].ok, true);
assert.equal(expect['device call under a tailnet Host name'].status, 200);
assert.equal(expect['device stream after restart'].firstItem, true);
assert.equal(expect['revoke'].closedStreams, 1);
assert.equal(expect['device call after revoke'].code, 'device-revoked');
assert.equal(expect['device upgrade after revoke'].code, 'device-revoked');
assert.equal(expect['operator call after revoke'].status, 200);
assert.equal(expect['credential absent from Host log'].absent, true);
assert.equal(expect['credential absent from developer log'].absent, true);
console.log('device pairing live proof passed');
