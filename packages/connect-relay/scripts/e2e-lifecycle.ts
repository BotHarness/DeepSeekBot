import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createCloudflaredResolver } from '../../core/src/devices/cloudflared.js';
import { createCloudflareApi } from '../src/cloudflare.js';
import { createRelay, TEST_LABEL_PREFIX, type RelayOptions } from '../src/relay.js';
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
const zone2 = env['E2E_ZONE2_NAME'];
const zone2Id = env['E2E_ZONE2_ID'];
const forbidden = (name: string | undefined) => name === 'deepseekbot.dev';
if (
  !token ||
  !accountId ||
  !zone ||
  !zoneId ||
  forbidden(zone) ||
  forbidden(zone2) ||
  (zone2 !== undefined && (!zone2Id || zone2 === zone))
) {
  console.error('needs CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, E2E_ZONE_NAME, E2E_ZONE_ID');
  console.error('optional E2E_ZONE2_NAME and E2E_ZONE2_ID for the multi-zone phase');
  console.error('test zones must never be deepseekbot.dev');
  process.exit(2);
}

const PREFIX = 'dsbe2e-';
const WINDOW_MS = 60_000;
const TEST_RECORD = new RegExp(`^${TEST_LABEL_PREFIX}[a-z2-7]{8}\\.`, 'u');
const testZones = [
  { name: zone, id: zoneId },
  ...(zone2 === undefined ? [] : [{ name: zone2, id: zone2Id as string }]),
];
const api = createCloudflareApi({ token, accountId, zones: testZones });
const testHostId = () => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `${TEST_LABEL_PREFIX}${Array.from(bytes, (byte) => alphabet[byte % 32]).join('')}`;
};

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
const zoneRecords = async (name: string) =>
  (await api.listRecords(name)).filter((entry) => TEST_RECORD.test(entry.name));
const allTestRecords = async () =>
  (await Promise.all(testZones.map((entry) => zoneRecords(entry.name)))).flat();
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

const testRelay = (
  overrides: Partial<RelayOptions> & Pick<RelayOptions, 'maxTunnels' | 'evictProtectMs'>,
) => {
  const db = localD1();
  const relay = createRelay({
    db,
    verifier: { verify: async (value) => ({ account: value }) },
    tunnels: api,
    clientId: 'e2e',
    zone,
    allowedUsers: [],
    maxHosts: 3,
    reclaimAfterMs: WINDOW_MS,
    tunnelPrefix: PREFIX,
    evictOfflineGraceMs: 20_000,
    evictFreshMs: 0,
    hostId: testHostId,
    ownsLabel: (label) => label.startsWith(TEST_LABEL_PREFIX),
    ...overrides,
  });
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
  const untilOnline = async (id: string, timeoutMs = 90_000) => {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      await relay.reclaim();
      if (['healthy', 'degraded'].includes((await row(id))?.['tunnel_status'])) return true;
      await sleep(5000);
    }
    return false;
  };
  const hosts: { account: string; id: string }[] = [];
  const addHost = async (account: string) => {
    const created = await call('POST', '/v1/hosts', account, { name: `E2E ${account}` });
    if (created.status === 201) hosts.push({ account, id: created.body.host.id });
    return created;
  };
  const provision = (account: string, id: string, zones = [zone]) =>
    call('POST', `/v1/hosts/${id}/tunnel`, account, { originPort, zones });
  const release = async () => {
    for (const host of hosts) {
      disconnect(host.id);
      await call('DELETE', `/v1/hosts/${host.id}`, host.account).catch(() => undefined);
    }
  };
  return { relay, call, row, untilOnline, addHost, provision, release };
};

const lifecycle = async () => {
  const run = testRelay({ maxTunnels: 2, evictProtectMs: 10 * 60_000 });
  const { relay, row, untilOnline, addHost, provision } = run;
  try {
    const ids: string[] = [];
    for (const account of ['e2e_alice', 'e2e_bob', 'e2e_carol'])
      ids.push((await addHost(account)).body.host.id);
    const [alice, bob, carol] = ids as [string, string, string];

    const first = await provision('e2e_alice', alice);
    record('provision returns hostname and token', first.status === 200, first.body.hostname);
    connect(alice, first.body.token);
    record('cloudflared connects and the relay caches healthy', await untilOnline(alice));
    record('phone gateway path reachable through the tunnel', await reachable(first.body.hostname));
    const outside = await fetch(`https://${first.body.hostname}/api`).catch(() => undefined);
    record('non-gateway path answers 404 at the edge', outside?.status === 404, outside?.status);

    const recordId = (await row(alice))?.['dns_record_id'];
    await api.deleteRecord(zone, recordId);
    const repaired = await relay.reclaim();
    record('online Host without a record is repaired', repaired.repaired.includes(alice));
    record('repaired hostname reachable again', await reachable(first.body.hostname));

    const second = await provision('e2e_bob', bob);
    record('second Host provisions and never connects', second.status === 200);
    record(
      'pool full: third Host refused while the others are protected or in grace',
      (await provision('e2e_carol', carol)).body.error?.code === 'relay-full',
    );
    await sleep(25_000);
    await relay.reclaim();
    const third = await provision('e2e_carol', carol);
    const evicted = await row(bob);
    record(
      'third Host evicts the never-connected Host, not the online one',
      third.status === 200 &&
        evicted?.['tunnel_id'] === null &&
        evicted?.['evicted_at'] !== null &&
        (await row(alice))?.['tunnel_id'] !== null,
      { status: third.status },
    );
    record(
      'evicted Host lost its record',
      !(await zoneRecords(zone)).some((entry) => entry.name === second.body.hostname),
    );
    record(
      'evicted Host cannot take a protected online slot back',
      (await provision('e2e_bob', bob)).body.error?.code === 'relay-full',
    );

    connect(carol, third.body.token);
    record('evicting Host comes online', await untilOnline(carol));
    record('evicting Host reachable', await reachable(third.body.hostname));
    disconnect(alice);
    disconnect(carol);
    await sleep(WINDOW_MS + 30_000);
    const reclaimed = await relay.reclaim();
    const names = (await zoneRecords(zone)).map((entry) => entry.name);
    record(
      'offline Hosts reclaimed with their records after the window',
      reclaimed.reclaimed.includes(alice) &&
        reclaimed.reclaimed.includes(carol) &&
        !names.includes(first.body.hostname) &&
        !names.includes(third.body.hostname),
      reclaimed.reclaimed,
    );

    const orphanTunnel = await api.createTunnel(`${PREFIX}horphanhorph`);
    const orphanRecord = await api.pointHostname(
      zone,
      `${TEST_LABEL_PREFIX}orphanaa.${zone}`,
      orphanTunnel,
    );
    await sleep(WINDOW_MS + 5000);
    const swept = await relay.reclaim();
    const leftTunnels = await prefixTunnels();
    record(
      'orphan tunnel and orphan record removed',
      swept.orphanTunnels >= 1 &&
        swept.orphanRecords >= 1 &&
        !leftTunnels.some(([id]) => id === orphanTunnel) &&
        !(await zoneRecords(zone)).some((entry) => entry.id === orphanRecord),
      { orphanTunnels: swept.orphanTunnels, orphanRecords: swept.orphanRecords },
    );

    const back = await provision('e2e_bob', bob);
    record(
      'freed slot lets the evicted Host return on a fresh test hostname',
      back.status === 200 &&
        back.body.hostname !== second.body.hostname &&
        TEST_RECORD.test(back.body.hostname),
      { before: second.body.hostname, after: back.body.hostname },
    );
    connect(bob, back.body.token);
    const started = Date.now();
    record(
      'returned Host reachable on the fresh hostname within 90 s',
      await reachable(back.body.hostname),
      {
        seconds: Math.round((Date.now() - started) / 1000),
      },
    );
  } finally {
    await run.release();
  }
};

const sharedPool = async (secondZone: string) => {
  const PROTECT_MS = 30_000;
  const run = testRelay({
    maxTunnels: 2,
    evictProtectMs: PROTECT_MS,
    zones: [zone, secondZone],
    zoneLimits: { [zone]: 50, [secondZone]: 50 },
  });
  const { call, row, untilOnline, addHost, provision } = run;
  const both = [zone, secondZone];
  try {
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) ids.push((await addHost('e2e_dave')).body.host.id);
    const [d1, d2, d3] = ids as [string, string, string];
    const fourth = await addHost('e2e_dave');
    record(
      'fourth computer on one account refused with host-limit',
      fourth.status === 409 && fourth.body.error?.code === 'host-limit',
      fourth.body,
    );
    const erin = (await addHost('e2e_erin')).body.host.id as string;

    const one = await provision('e2e_dave', d1, both);
    const two = await provision('e2e_dave', d2, both);
    const placed = [(await row(d1))?.['zone'], (await row(d2))?.['zone']];
    record(
      'Hosts spread across both zones',
      one.status === 200 &&
        two.status === 200 &&
        new Set(placed).size === 2 &&
        placed.every((name) => both.includes(name)),
      { placed, hostnames: [one.body.hostname, two.body.hostname] },
    );
    connect(d1, one.body.token);
    connect(d2, two.body.token);
    record('both Hosts come online', (await untilOnline(d1)) && (await untilOnline(d2)));
    record(
      'both Hosts reachable on their own zones',
      (await reachable(one.body.hostname)) && (await reachable(two.body.hostname)),
    );

    const waitFirst = await provision('e2e_dave', d3, both);
    const waitSecond = await provision('e2e_erin', erin, both);
    record(
      'full pool queues the next Hosts in order with a retry hint',
      waitFirst.status === 503 &&
        waitFirst.body.error?.position === 1 &&
        waitSecond.body.error?.position === 2 &&
        waitSecond.body.error?.retryAfter > 0 &&
        waitSecond.body.error?.pool?.waiting === 2 &&
        waitSecond.body.error?.pool?.free === 0,
      { first: waitFirst.body.error, second: waitSecond.body.error },
    );
    const listed = await call('GET', '/v1/hosts', 'e2e_dave');
    const nextFreeAt = Date.parse(listed.body.pool?.nextFreeAt ?? '');
    record(
      'pool status shows the queue and when a slot frees',
      listed.body.hosts.find((host: Record<string, any>) => host.id === d3)?.state === 'waiting' &&
        Number.isFinite(nextFreeAt) &&
        nextFreeAt - Date.now() <= PROTECT_MS,
      listed.body.pool,
    );

    await sleep(PROTECT_MS + 5000);
    await untilOnline(d1);
    await untilOnline(d2);
    const used = await call('GET', `/v1/hosts?host=${d1}&idle=0`, 'e2e_dave');
    record('Host reports use', used.status === 200);
    const jumped = await provision('e2e_erin', erin, both);
    record(
      'second in line cannot take the freed slot',
      jumped.status === 503 && jumped.body.error?.position === 2,
      jumped.body.error,
    );
    const evicted = await row(d2);
    record(
      'least recently used online Host evicted, the recently used one kept',
      evicted?.['tunnel_id'] === null &&
        evicted?.['evicted_at'] !== null &&
        (await row(d1))?.['tunnel_id'] !== null,
    );
    record(
      'evicted Host lost its record',
      !(await zoneRecords(two.body.hostname.slice(two.body.hostname.indexOf('.') + 1))).some(
        (entry) => entry.name === two.body.hostname,
      ),
    );
    const head = await provision('e2e_dave', d3, both);
    record(
      'head of the queue gets the freed slot',
      head.status === 200,
      head.body.hostname ?? head.body.error,
    );
    connect(d3, head.body.token);
    record('queued Host comes online', await untilOnline(d3));
    record('queued Host reachable', await reachable(head.body.hostname));
    const states = (await call('GET', '/v1/hosts', 'e2e_dave')).body.hosts as Record<string, any>[];
    record(
      'phone sees the evicted Host as released',
      states.find((host) => host.id === d2)?.state === 'released',
      states.map((host) => ({ id: host.id, state: host.state })),
    );
  } finally {
    await run.release();
  }
};

try {
  await lifecycle();
  if (zone2 === undefined) console.log('SKIP shared pool phase: no E2E_ZONE2_NAME');
  else await sharedPool(zone2);
} catch (error) {
  record('unexpected error', false, error instanceof Error ? error.message : String(error));
} finally {
  for (const id of [...connectors.keys()]) disconnect(id);
  for (const [id] of await prefixTunnels()) await api.deleteTunnel(id).catch(() => undefined);
  for (const entry of testZones)
    for (const found of await zoneRecords(entry.name))
      await api.deleteRecord(entry.name, found.id).catch(() => undefined);
  const leftover = {
    tunnels: (await prefixTunnels()).length,
    records: (await allTestRecords()).length,
  };
  record(
    'cleanup leaves no test tunnels or records',
    leftover.tunnels === 0 && leftover.records === 0,
    leftover,
  );
  origin.close();
  writeFileSync(
    reportFile,
    `${JSON.stringify({ zones: testZones.map((entry) => entry.name), steps }, null, 2)}\n`,
  );
  process.exitCode = steps.every((step) => step.ok) ? 0 : 1;
}
