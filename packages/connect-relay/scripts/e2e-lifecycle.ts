import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createCloudflaredResolver } from '../../core/src/devices/cloudflared.js';
import { createCloudflareApi } from '../src/cloudflare.js';
import { createRelay } from '../src/relay.js';
import { localD1 } from '../test/support.js';

const envFile = process.argv[2];
const reportFile = process.argv[3] ?? 'connect-e2e-report.json';
if (!envFile) {
  console.error('usage: unrun scripts/e2e-lifecycle.ts <cloudflare.env> [report.json]');
  process.exit(2);
}
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split('\n')
    .map((line) => /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => [match[1], match[2]!.replace(/^["']|["']$/gu, '')]),
);
const token = env['CLOUDFLARE_API_TOKEN'];
const accountId = env['CLOUDFLARE_ACCOUNT_ID'];
const zone = env['E2E_ZONE_NAME'];
const zoneId = env['E2E_ZONE_ID'];
if (!token || !accountId || !zone || !zoneId || zone === 'deepseekbot.dev') {
  console.error('needs CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, E2E_ZONE_NAME, E2E_ZONE_ID');
  console.error('E2E_ZONE_NAME must be a dedicated test zone, never deepseekbot.dev');
  process.exit(2);
}

const PREFIX = 'dsbe2e-';
const WINDOW_MS = 60_000;
const api = createCloudflareApi({ token, accountId, zones: [{ name: zone, id: zoneId }] });
const db = localD1();
const relay = createRelay({
  db,
  verifier: { verify: async (value) => ({ account: value }) },
  tunnels: api,
  clientId: 'e2e',
  zone,
  allowedUsers: [],
  maxHosts: 3,
  maxTunnels: 2,
  reclaimAfterMs: WINDOW_MS,
  tunnelPrefix: PREFIX,
  evictOfflineGraceMs: 20_000,
  evictProtectMs: 10 * 60_000,
  evictFreshMs: 0,
});

const steps: { step: string; ok: boolean; detail?: unknown; at: string }[] = [];
const record = (step: string, ok: boolean, detail?: unknown) => {
  steps.push({
    step,
    ok,
    ...(detail === undefined ? {} : { detail }),
    at: new Date().toISOString(),
  });
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${step}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`,
  );
};
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const call = async (method: string, path: string, account: string, body?: unknown) => {
  const response = await relay.fetch(
    new Request(`https://relay.e2e${path}`, {
      method,
      headers: { authorization: `Bearer ${account}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, any> };
};
const row = (id: string) =>
  db.prepare('SELECT * FROM hosts WHERE id = ?').bind(id).first<Record<string, any>>();
const zoneRecords = async () =>
  (await api.listRecords(zone)).filter((entry) => /^h[a-z2-7]{12}\./u.test(entry.name));
const prefixTunnels = async () =>
  [...(await api.listTunnels()).states.entries()].filter(([, state]) =>
    state.name?.startsWith(PREFIX),
  );

const origin = createServer((request, response) => {
  if (request.url === '/botharness-device/channel') {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('connect-e2e');
    return;
  }
  response.writeHead(404);
  response.end();
});
await new Promise<void>((done) => origin.listen(0, '127.0.0.1', done));
const originPort = (origin.address() as AddressInfo).port;
const binary = (
  await createCloudflaredResolver({ cacheDir: join(tmpdir(), 'dsb-e2e-cloudflared') })()
).binary;
const connectors = new Map<string, ChildProcess>();
const connect = (id: string, tunnelToken: string) => {
  const child = spawn(binary, ['tunnel', '--no-autoupdate', 'run'], {
    env: { ...process.env, TUNNEL_TOKEN: tunnelToken },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.on('error', (error) => record('cloudflared failed to start', false, error.message));
  connectors.set(id, child);
};
const disconnect = (id: string) => {
  connectors.get(id)?.kill();
  connectors.delete(id);
};
const reachable = async (hostname: string, timeoutMs = 90_000) => {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const response = await fetch(`https://${hostname}/botharness-device/channel`);
      if (response.status === 200 && (await response.text()) === 'connect-e2e') return true;
    } catch {}
    await sleep(3000);
  }
  return false;
};
const untilOnline = async (id: string, timeoutMs = 90_000) => {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    await relay.reclaim();
    if (['healthy', 'degraded'].includes((await row(id))?.['tunnel_status'])) return true;
    await sleep(5000);
  }
  return false;
};
const provision = (account: string, id: string) =>
  call('POST', `/v1/hosts/${id}/tunnel`, account, { originPort, zones: [zone] });

const hosts: { account: string; id: string }[] = [];
try {
  for (const account of ['e2e_alice', 'e2e_bob', 'e2e_carol']) {
    const created = await call('POST', '/v1/hosts', account, { name: `E2E ${account}` });
    hosts.push({ account, id: created.body.host.id });
  }
  const [alice, bob, carol] = hosts as [(typeof hosts)[0], (typeof hosts)[0], (typeof hosts)[0]];

  const first = await provision(alice.account, alice.id);
  record('provision returns hostname and token', first.status === 200, first.body.hostname);
  connect(alice.id, first.body.token);
  record('cloudflared connects and the relay caches healthy', await untilOnline(alice.id));
  record('phone gateway path reachable through the tunnel', await reachable(first.body.hostname));
  const outside = await fetch(`https://${first.body.hostname}/api`).catch(() => undefined);
  record('non-gateway path answers 404 at the edge', outside?.status === 404, outside?.status);

  const recordId = (await row(alice.id))?.['dns_record_id'];
  await api.deleteRecord(zone, recordId);
  const repaired = await relay.reclaim();
  record('online Host without a record is repaired', repaired.repaired.includes(alice.id));
  record('repaired hostname reachable again', await reachable(first.body.hostname));

  const second = await provision(bob.account, bob.id);
  record('second Host provisions and never connects', second.status === 200);
  record(
    'pool full: third Host refused while the others are protected or in grace',
    (await provision(carol.account, carol.id)).body.error?.code === 'relay-full',
  );
  await sleep(25_000);
  await relay.reclaim();
  const third = await provision(carol.account, carol.id);
  const evicted = await row(bob.id);
  record(
    'third Host evicts the never-connected Host, not the online one',
    third.status === 200 &&
      evicted?.['tunnel_id'] === null &&
      evicted?.['evicted_at'] !== null &&
      (await row(alice.id))?.['tunnel_id'] !== null,
    { status: third.status },
  );
  record(
    'evicted Host lost its record',
    !(await zoneRecords()).some((entry) => entry.name === `${bob.id}.${zone}`),
  );
  record(
    'evicted Host cannot take a protected online slot back',
    (await provision(bob.account, bob.id)).body.error?.code === 'relay-full',
  );

  connect(carol.id, third.body.token);
  record('evicting Host comes online', await untilOnline(carol.id));
  record('evicting Host reachable', await reachable(third.body.hostname));
  disconnect(alice.id);
  disconnect(carol.id);
  await sleep(WINDOW_MS + 30_000);
  const reclaimed = await relay.reclaim();
  const names = (await zoneRecords()).map((entry) => entry.name);
  record(
    'offline Hosts reclaimed with their records after the window',
    reclaimed.reclaimed.includes(alice.id) &&
      reclaimed.reclaimed.includes(carol.id) &&
      !names.includes(`${alice.id}.${zone}`) &&
      !names.includes(`${carol.id}.${zone}`),
    reclaimed.reclaimed,
  );

  const orphanTunnel = await api.createTunnel(`${PREFIX}horphanhorph`);
  const orphanRecord = await api.pointHostname(zone, `hzzzzzzzzzzzz.${zone}`, orphanTunnel);
  await sleep(WINDOW_MS + 5000);
  const swept = await relay.reclaim();
  const leftTunnels = await prefixTunnels();
  record(
    'orphan tunnel and orphan record removed',
    swept.orphanTunnels >= 1 &&
      swept.orphanRecords >= 1 &&
      !leftTunnels.some(([id]) => id === orphanTunnel) &&
      !(await zoneRecords()).some((entry) => entry.id === orphanRecord),
    { orphanTunnels: swept.orphanTunnels, orphanRecords: swept.orphanRecords },
  );

  const back = await provision(bob.account, bob.id);
  record(
    'freed slot lets the evicted Host return on its own hostname',
    back.body.hostname === second.body.hostname,
  );
  connect(bob.id, back.body.token);
  record('returned Host reachable', await reachable(back.body.hostname));
} catch (error) {
  record('unexpected error', false, error instanceof Error ? error.message : String(error));
} finally {
  for (const id of [...connectors.keys()]) disconnect(id);
  for (const host of hosts)
    await call('DELETE', `/v1/hosts/${host.id}`, host.account).catch(() => undefined);
  for (const [id] of await prefixTunnels()) await api.deleteTunnel(id).catch(() => undefined);
  for (const entry of await zoneRecords())
    await api.deleteRecord(zone, entry.id).catch(() => undefined);
  const leftover = {
    tunnels: (await prefixTunnels()).length,
    records: (await zoneRecords()).length,
  };
  record(
    'cleanup leaves no test tunnels or records',
    leftover.tunnels === 0 && leftover.records === 0,
    leftover,
  );
  origin.close();
  writeFileSync(reportFile, `${JSON.stringify({ zone, steps }, null, 2)}\n`);
  process.exitCode = steps.every((step) => step.ok) ? 0 : 1;
}
