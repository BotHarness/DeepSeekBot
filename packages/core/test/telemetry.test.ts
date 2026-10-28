import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createTelemetryService,
  fetchTelemetrySender,
  INSTALL_ID_FILE,
  installedDshVersion,
  readInstallId,
  TELEMETRY_API_KEY,
  TELEMETRY_ENDPOINT,
  telemetryDecision,
  type TelemetryBatch,
  type TelemetrySender,
} from '../src/telemetry/service.js';
import { hostContextProperties, type HostTelemetryFacts } from '../src/telemetry/context.js';
import { createBridgeMethods } from '../src/bridge/methods.js';

const dirs: string[] = [];

function dataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bh-telemetry-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const FACTS: HostTelemetryFacts = {
  pluginVersion: '1.0.2',
  dshVersion: '0.2.0-rc.1',
  os: 'darwin',
  arch: 'arm64',
  nodeVersion: '24.21.0',
  osRelease: '25.1.0-private-kernel-suffix',
  cpuCount: 10,
  totalMemory: 24 * 1024 ** 3,
};
const STARTED = hostContextProperties(FACTS);

function recordingSender(): { send: TelemetrySender; batches: TelemetryBatch[] } {
  const batches: TelemetryBatch[] = [];
  return {
    batches,
    send: vi.fn<TelemetrySender>(async (batch) => {
      batches.push(structuredClone(batch));
    }),
  };
}

describe('telemetryDecision', () => {
  it('defaults on', () => {
    expect(telemetryDecision(undefined, {})).toEqual({ enabled: true });
    expect(telemetryDecision(true, { BOTHARNESS_TELEMETRY: '1', DO_NOT_TRACK: '0' })).toEqual({
      enabled: true,
    });
  });

  it('honours the config and both environment opt-outs', () => {
    expect(telemetryDecision(false, {})).toEqual({ enabled: false, reason: 'config' });
    expect(telemetryDecision(true, { DO_NOT_TRACK: '1' })).toEqual({
      enabled: false,
      reason: 'DO_NOT_TRACK',
    });
    expect(telemetryDecision(undefined, { BOTHARNESS_TELEMETRY: '0' })).toEqual({
      enabled: false,
      reason: 'BOTHARNESS_TELEMETRY',
    });
  });
});

describe('telemetry service', () => {
  it.each([
    ['config false', telemetryDecision(false, {})],
    ['DO_NOT_TRACK=1', telemetryDecision(true, { DO_NOT_TRACK: '1' })],
    ['BOTHARNESS_TELEMETRY=0', telemetryDecision(true, { BOTHARNESS_TELEMETRY: '0' })],
  ])('never calls the sender or writes an Install ID with %s', async (_, decision) => {
    const dir = dataDir();
    const { send } = recordingSender();
    const context = vi.fn(() => FACTS);
    const telemetry = createTelemetryService({ decision, dataDir: dir, send, context });

    telemetry.capture('plugin_started', STARTED);
    await telemetry.flush();
    await telemetry.close();

    expect(telemetry.status()).toEqual({
      enabled: false,
      preference: true,
      lockedBy: decision.enabled ? undefined : decision.reason,
    });
    expect(telemetry.setPreference(true).enabled).toBe(false);
    telemetry.capture('second', {});
    await telemetry.flush();
    expect(send).not.toHaveBeenCalled();
    expect(context).not.toHaveBeenCalled();
    expect(() => readFileSync(join(dir, INSTALL_ID_FILE))).toThrow();
  });

  it('sends plugin_started with only the allowed keys and an anonymous Install ID', async () => {
    const dir = dataDir();
    const { send, batches } = recordingSender();
    const telemetry = createTelemetryService({
      decision: { enabled: true },
      dataDir: dir,
      send,
      now: () => new Date('2026-10-06T08:00:00.000Z'),
      context: () => FACTS,
    });

    telemetry.capture('plugin_started', STARTED);
    await telemetry.flush();

    expect(send).toHaveBeenCalledOnce();
    const [batch] = batches;
    expect(batch?.api_key).toBe(TELEMETRY_API_KEY);
    expect(batch?.batch).toHaveLength(1);
    const event = batch!.batch[0]!;
    expect(Object.keys(event).sort()).toEqual(['distinct_id', 'event', 'properties', 'timestamp']);
    expect(event.event).toBe('plugin_started');
    expect(event.timestamp).toBe('2026-10-06T08:00:00.000Z');
    expect(event.distinct_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    );
    expect(event.properties).toEqual({
      plugin_version: '1.0.2',
      dsh_version: '0.2.0-rc.1',
      os: 'darwin',
      arch: 'arm64',
      node_version: '24',
      os_release_major: '25',
      cpu_count_bucket: '9-16',
      total_mem_gb_bucket: '32',
      source: 'plugin',
      $process_person_profile: false,
      $geoip_disable: true,
    });
    const serialized = JSON.stringify(batch);
    for (const forbidden of [dir, tmpdir(), process.cwd(), 'bh-telemetry-']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('reduces non-version facts to unknown so paths cannot leak', () => {
    expect(
      hostContextProperties({
        ...FACTS,
        pluginVersion: '/Users/someone/.dsh/package.json',
        dshVersion: undefined,
        os: 'linux',
        arch: 'x64',
      }),
    ).toEqual({
      ...STARTED,
      plugin_version: 'unknown',
      dsh_version: 'unknown',
      os: 'linux',
      arch: 'x64',
    });
  });

  it('attaches authoritative context to usage and exceptions, including after re-enabling', async () => {
    const { send, batches } = recordingSender();
    const context = vi.fn(() => FACTS);
    const telemetry = createTelemetryService({
      decision: { enabled: true },
      dataDir: dataDir(),
      send,
      context,
    });
    telemetry.capture('bot_created', {
      plugin_version: 'spoofed',
      cpu_count_bucket: 999,
      $geoip_disable: false,
    });
    telemetry.capture('daily_usage', { messages: 7 });
    telemetry.captureException({
      type: 'Error',
      mechanism: { type: 'onuncaughtexception', handled: false },
      stacktrace: { type: 'raw', frames: [] },
    });
    await telemetry.flush();
    telemetry.setPreference(false);
    telemetry.capture('discarded');
    telemetry.setPreference(true);
    telemetry.capture('bot_archived');
    await telemetry.close();
    const events = batches.flatMap((batch) => batch.batch);
    expect(events.map((event) => event.event)).toEqual([
      'bot_created',
      'daily_usage',
      '$exception',
      'bot_archived',
    ]);
    for (const event of events)
      expect(event.properties).toMatchObject({
        ...STARTED,
        $geoip_disable: true,
        $process_person_profile: false,
      });
    expect(context).toHaveBeenCalledOnce();
  });

  it('keeps the same Install ID across starts', async () => {
    const dir = dataDir();
    const ids: string[] = [];
    for (let start = 0; start < 2; start += 1) {
      const { send, batches } = recordingSender();
      const telemetry = createTelemetryService({ decision: { enabled: true }, dataDir: dir, send });
      telemetry.capture('plugin_started', STARTED);
      await telemetry.close();
      ids.push(batches[0]!.batch[0]!.distinct_id);
    }
    expect(ids[0]).toBe(ids[1]);
    expect(JSON.parse(readFileSync(join(dir, INSTALL_ID_FILE), 'utf8'))).toEqual({
      installId: ids[0],
    });
  });

  it('replaces an invalid stored Install ID with a random one', async () => {
    const dir = dataDir();
    writeFileSync(join(dir, INSTALL_ID_FILE), JSON.stringify({ installId: 'my-hostname' }));
    const { send, batches } = recordingSender();
    const telemetry = createTelemetryService({
      decision: { enabled: true },
      dataDir: dir,
      send,
      createId: () => '00000000-0000-4000-8000-000000000001',
    });
    telemetry.capture('plugin_started', STARTED);
    await telemetry.flush();
    expect(batches[0]!.batch[0]!.distinct_id).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('keeps a Marketplace from property next to the plugin source', async () => {
    const { send, batches } = recordingSender();
    const telemetry = createTelemetryService({
      decision: { enabled: true },
      dataDir: dataDir(),
      send,
    });
    telemetry.capture('marketplace_bot_installed', { from: 'digest' });
    await telemetry.close();
    expect(batches[0]!.batch[0]!.properties).toMatchObject({ from: 'digest', source: 'plugin' });
  });

  it('swallows a sender rejection and retries those events once with the next batch', async () => {
    const dir = dataDir();
    const send = vi.fn<TelemetrySender>().mockRejectedValue(new Error('offline'));
    const telemetry = createTelemetryService({ decision: { enabled: true }, dataDir: dir, send });

    telemetry.capture('plugin_started', STARTED);
    await expect(telemetry.flush()).resolves.toBeUndefined();
    telemetry.capture('second', {});
    await expect(telemetry.flush()).resolves.toBeUndefined();
    await expect(telemetry.close()).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[1]![0].batch.map((event) => event.event)).toEqual([
      'plugin_started',
      'second',
    ]);
    expect(send.mock.calls[2]![0].batch.map((event) => event.event)).toEqual(['second']);
  });

  it('batches events captured close together into one request', async () => {
    vi.useFakeTimers();
    try {
      const { send, batches } = recordingSender();
      const telemetry = createTelemetryService({
        decision: { enabled: true },
        dataDir: dataDir(),
        send,
        flushDelayMs: 1_000,
      });
      telemetry.capture('plugin_started', STARTED);
      telemetry.capture('second', {});
      expect(send).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(send).toHaveBeenCalledOnce();
      expect(batches[0]!.batch).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('telemetry preference', () => {
  it('never sends after the Human turns it off and keeps it off across restarts', async () => {
    const dir = dataDir();
    const { send } = recordingSender();
    const telemetry = createTelemetryService({ decision: { enabled: true }, dataDir: dir, send });
    telemetry.capture('plugin_started', STARTED);
    const installId = readInstallId(dir);

    expect(telemetry.setPreference(false)).toEqual({ enabled: false, preference: false });
    expect(telemetry.enabled).toBe(false);
    telemetry.capture('second', {});
    await telemetry.flush();
    await telemetry.close();
    expect(send).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(join(dir, INSTALL_ID_FILE), 'utf8'))).toEqual({
      installId,
      enabled: false,
    });

    const restarted = recordingSender();
    const next = createTelemetryService({
      decision: { enabled: true },
      dataDir: dir,
      send: restarted.send,
    });
    expect(next.status()).toEqual({ enabled: false, preference: false });
    next.capture('plugin_started', STARTED);
    await next.close();
    expect(restarted.send).not.toHaveBeenCalled();
  });

  it('drops queued events when turned off before the batch is sent', async () => {
    vi.useFakeTimers();
    try {
      const { send } = recordingSender();
      const telemetry = createTelemetryService({
        decision: { enabled: true },
        dataDir: dataDir(),
        send,
        flushDelayMs: 1_000,
      });
      telemetry.capture('plugin_started', STARTED);
      telemetry.setPreference(false);
      telemetry.setPreference(true);
      await vi.advanceTimersByTimeAsync(5_000);
      await telemetry.flush();
      expect(send).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not carry a failed batch once turned off mid-send', async () => {
    const dir = dataDir();
    let reject: (error: Error) => void = () => undefined;
    const send = vi.fn<TelemetrySender>(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    const telemetry = createTelemetryService({ decision: { enabled: true }, dataDir: dir, send });
    telemetry.capture('plugin_started', STARTED);
    const flushing = telemetry.flush();
    telemetry.setPreference(false);
    reject(new Error('offline'));
    await flushing;
    telemetry.setPreference(true);
    await telemetry.flush();
    expect(send).toHaveBeenCalledOnce();
  });

  it('resumes without a restart and creates the Install ID when it was missing', async () => {
    const dir = dataDir();
    writeFileSync(join(dir, INSTALL_ID_FILE), JSON.stringify({ enabled: false }));
    const { send, batches } = recordingSender();
    const telemetry = createTelemetryService({
      decision: { enabled: true },
      dataDir: dir,
      send,
      createId: () => '00000000-0000-4000-8000-000000000002',
    });
    telemetry.capture('plugin_started', STARTED);

    expect(telemetry.setPreference(true)).toEqual({ enabled: true, preference: true });
    expect(JSON.parse(readFileSync(join(dir, INSTALL_ID_FILE), 'utf8'))).toEqual({
      installId: '00000000-0000-4000-8000-000000000002',
    });
    telemetry.capture('feature_used', {});
    await telemetry.flush();
    expect(batches.flatMap((batch) => batch.batch.map((event) => event.event))).toEqual([
      'feature_used',
    ]);
    expect(batches[0]!.batch[0]!.distinct_id).toBe('00000000-0000-4000-8000-000000000002');
  });

  it('reports the stored preference while config or env lock it off', () => {
    const dir = dataDir();
    writeFileSync(join(dir, INSTALL_ID_FILE), JSON.stringify({ enabled: false }));
    const telemetry = createTelemetryService({
      decision: telemetryDecision(true, { DO_NOT_TRACK: '1' }),
      dataDir: dir,
      send: recordingSender().send,
    });
    expect(telemetry.status()).toEqual({
      enabled: false,
      preference: false,
      lockedBy: 'DO_NOT_TRACK',
    });
    expect(telemetry.setPreference(true)).toEqual({
      enabled: false,
      preference: false,
      lockedBy: 'DO_NOT_TRACK',
    });
    expect(JSON.parse(readFileSync(join(dir, INSTALL_ID_FILE), 'utf8'))).toEqual({
      enabled: false,
    });
  });
});

describe('fetchTelemetrySender', () => {
  it('posts the batch as JSON to the first-party proxy', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }));
    await fetchTelemetrySender(fetchImpl)({ api_key: TELEMETRY_API_KEY, batch: [] });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(TELEMETRY_ENDPOINT);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ api_key: TELEMETRY_API_KEY, batch: [] });
  });

  it('rejects on a non-success response so the service can drop it', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('', { status: 503 }));
    await expect(
      fetchTelemetrySender(fetchImpl)({ api_key: TELEMETRY_API_KEY, batch: [] }),
    ).rejects.toThrow('503');
  });
});

describe('installedDshVersion', () => {
  it('reads the version of the resolved DSH package', () => {
    expect(installedDshVersion()).toMatch(/^\d+\.\d+\.\d+/u);
  });

  it('returns undefined when DSH cannot be resolved', () => {
    expect(
      installedDshVersion(() => {
        throw new Error('missing');
      }),
    ).toBeUndefined();
  });
});

describe('telemetryStatus bridge method', () => {
  it('reports the Host decision to the Client', () => {
    const methods = createBridgeMethods({
      telemetry: { status: () => ({ enabled: true, preference: true }) },
    } as unknown as Parameters<typeof createBridgeMethods>[0]);
    expect(methods.telemetryStatus()).toEqual({
      ok: true,
      value: { enabled: true, preference: true },
    });
  });

  it('reports disabled when the Host has no telemetry', () => {
    const methods = createBridgeMethods({} as unknown as Parameters<typeof createBridgeMethods>[0]);
    expect(methods.telemetryStatus()).toEqual({
      ok: true,
      value: { enabled: false, preference: false },
    });
    expect(methods.telemetrySet({ enabled: false })).toMatchObject({
      ok: false,
      error: { code: 'telemetry-unavailable' },
    });
  });

  it('applies the Human choice through telemetrySet', () => {
    const telemetry = createTelemetryService({
      decision: { enabled: true },
      dataDir: dataDir(),
      send: recordingSender().send,
    });
    const methods = createBridgeMethods({ telemetry } as unknown as Parameters<
      typeof createBridgeMethods
    >[0]);
    expect(methods.telemetrySet({})).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(methods.telemetrySet({ enabled: false })).toEqual({
      ok: true,
      value: { enabled: false, preference: false },
    });
    expect(methods.telemetryStatus()).toEqual({
      ok: true,
      value: { enabled: false, preference: false },
    });
  });

  it('reports a persistence failure while keeping it off for this run', () => {
    const dir = dataDir();
    const telemetry = createTelemetryService({
      decision: { enabled: true },
      dataDir: join(dir, INSTALL_ID_FILE, 'nested'),
      send: recordingSender().send,
    });
    writeFileSync(join(dir, INSTALL_ID_FILE), '{}');
    const methods = createBridgeMethods({ telemetry } as unknown as Parameters<
      typeof createBridgeMethods
    >[0]);
    expect(methods.telemetrySet({ enabled: false })).toMatchObject({
      ok: false,
      error: { code: 'telemetry-persist-failed' },
    });
    expect(telemetry.enabled).toBe(false);
  });
});
