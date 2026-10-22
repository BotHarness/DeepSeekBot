import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_ILLUSTRATED_RECIPE } from '../src/bots/avatar-appearance.js';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { connectorType, createOutboundMessaging } from '../src/messaging/outbound.js';
import type { MessagingProvider } from '../src/messaging/provider.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import {
  DAILY_USAGE_PERIOD_MS,
  dailyUsageProperties,
  readDailyUsageCounts,
  startDailyUsage,
} from '../src/telemetry/daily-usage.js';
import {
  deliverPendingExceptions,
  installExceptionCapture,
  PENDING_EXCEPTIONS_FILE,
  sanitizeException,
  scrubHomePaths,
  type ExceptionCaptureProcess,
} from '../src/telemetry/exceptions.js';
import {
  createTelemetryService,
  ensureInstallId,
  INSTALL_ID_FILE,
  readDailyUsageAt,
  readTelemetryPreference,
  telemetryDecision,
  writeDailyUsageAt,
  writeTelemetryPreference,
  type TelemetryBatchEvent,
  type TelemetryDecision,
  type TelemetrySender,
} from '../src/telemetry/service.js';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';

const dirs: string[] = [];
const cleanup: (() => void)[] = [];

function tempDir(prefix = 'bh-telemetry-events-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const DISPLAY_NAME = 'Ada Lovelace Private Name';
const PERSONA = 'Secret persona text about the Human';
const GIT_URL = 'https://github.com/someone/private-memory.git';
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZFsAAAAASUVORK5CYII=';
const BASE_KEYS = [
  '$geoip_disable',
  '$process_person_profile',
  'source',
  'plugin_version',
  'dsh_version',
  'os',
  'arch',
  'node_version',
  'os_release_major',
  'cpu_count_bucket',
  'total_mem_gb_bucket',
].sort();

function recorder(decision: TelemetryDecision = { enabled: true }) {
  const events: TelemetryBatchEvent[] = [];
  const send = vi.fn<TelemetrySender>(async (batch) => {
    events.push(...structuredClone(batch.batch));
  });
  const dataDir = tempDir();
  const telemetry = createTelemetryService({
    decision,
    dataDir,
    send,
    flushDelayMs: 60_000,
    createId: () => '11111111-1111-4111-8111-111111111111',
  });
  cleanup.push(() => void telemetry.close());
  return {
    telemetry,
    dataDir,
    send,
    capture: (event: string, properties?: Parameters<typeof telemetry.capture>[1]) =>
      telemetry.capture(event, properties),
    async events(): Promise<TelemetryBatchEvent[]> {
      await telemetry.flush();
      return events;
    },
  };
}

function keys(event: TelemetryBatchEvent | undefined): string[] {
  return Object.keys(event?.properties ?? {}).sort();
}

function expectNoContent(events: TelemetryBatchEvent[], ...extra: string[]): void {
  const serialized = JSON.stringify(events);
  for (const forbidden of [DISPLAY_NAME, PERSONA, GIT_URL, tmpdir(), process.cwd(), ...extra]) {
    expect(serialized).not.toContain(forbidden);
  }
  for (const event of events) {
    for (const value of Object.values(event.properties)) {
      if (typeof value === 'string') expect(value).not.toMatch(/[\\/]/u);
    }
  }
}

function registryWith(capture: (event: string) => void) {
  const root = tempDir('bh-telemetry-registry-');
  const database = registryDatabase(join(root, 'bots'));
  cleanup.push(() => database.close());
  return createTestRegistry({
    rootDir: join(root, 'bots'),
    database,
    capture,
    cloneMemory: async (destination) => {
      mkdirSync(destination, { recursive: true });
      writeFileSync(join(destination, 'PERSONA.md'), PERSONA);
      return { ok: true };
    },
  });
}

describe('PersonaBot lifecycle telemetry', () => {
  it('captures bot_created with only the base properties', async () => {
    const r = recorder();
    const registry = registryWith(r.capture);
    expect(registry.create({ slug: 'ada', displayName: DISPLAY_NAME, persona: PERSONA }).ok).toBe(
      true,
    );
    expect(registry.create({ slug: 'ada', displayName: DISPLAY_NAME }).ok).toBe(false);
    const events = await r.events();
    expect(events.map((event) => event.event)).toEqual(['bot_created']);
    expect(keys(events[0])).toEqual(BASE_KEYS);
    expectNoContent(events, 'ada');
  });

  it('captures bot_created for a Git import without the repository URL', async () => {
    const r = recorder();
    const registry = registryWith(r.capture);
    const result = await registry.createFromGit({
      slug: 'imported',
      displayName: DISPLAY_NAME,
      gitUrl: GIT_URL,
    });
    expect(result.ok).toBe(true);
    const events = await r.events();
    expect(events.map((event) => event.event)).toEqual(['bot_created']);
    expect(keys(events[0])).toEqual(BASE_KEYS);
    expectNoContent(events, 'imported');
  });

  it('captures bot_archived once per archive transition', async () => {
    const r = recorder();
    const registry = registryWith(r.capture);
    registry.create({ slug: 'ada', displayName: DISPLAY_NAME });
    registry.setPaused('ada', true);
    registry.setPaused('ada', true);
    registry.setPaused('ada', false);
    registry.setPaused('missing', true);
    const events = (await r.events()).filter((event) => event.event !== 'bot_created');
    expect(events.map((event) => event.event)).toEqual(['bot_archived']);
    expect(keys(events[0])).toEqual(BASE_KEYS);
    expectNoContent(events, 'ada');
  });

  it('captures bot_deleted once after confirmed terminal deletion without private content', async () => {
    const r = recorder();
    const core = createCore({ dshHome: tempDir('bh-telemetry-deletion-'), capture: r.capture });
    try {
      core.registry.create({ slug: 'ada', displayName: DISPLAY_NAME, persona: PERSONA });
      expect(() => core.registry.remove('ada')).toThrow('confirmed PersonaBot deletion');
      expect((await r.events()).filter((event) => event.event === 'bot_deleted')).toEqual([]);
      const preview = core.deletions.preview('ada');
      await expect(core.deletions.confirm('ada', 'stale', false)).rejects.toThrow('scope changed');
      await core.deletions.confirm('ada', preview.token, false);
      await core.deletions.retry('ada');
      await expect(core.deletions.confirm('ada', preview.token, false)).rejects.toThrow(
        'scope changed',
      );
      const events = (await r.events()).filter((event) => event.event !== 'bot_created');
      expect(events.map((event) => event.event)).toEqual(['bot_deleted']);
      expect(keys(events[0])).toEqual(BASE_KEYS);
      expectNoContent(events, 'ada');
    } finally {
      core.schedules.close();
      await core.runtime.close();
      core.externalMessaging.close();
      core.operationalDatabase.close();
    }
  });

  it('captures avatar_edited for an uploaded image and an Avatar Appearance', async () => {
    const r = recorder();
    const registry = registryWith(r.capture);
    registry.create({ slug: 'ada', displayName: DISPLAY_NAME });
    expect(registry.update('ada', { avatar: PNG }).ok).toBe(true);
    expect(registry.update('ada', { avatar: PNG, description: 'same avatar' }).ok).toBe(true);
    expect(registry.update('ada', { displayName: 'Renamed' }).ok).toBe(true);
    expect(registry.setAppearance('ada', DEFAULT_ILLUSTRATED_RECIPE).ok).toBe(true);
    expect(registry.setAppearance('ada', { invalid: true }).ok).toBe(false);
    const events = (await r.events()).filter((event) => event.event !== 'bot_created');
    expect(events.map((event) => event.event)).toEqual(['avatar_edited', 'avatar_edited']);
    for (const event of events) expect(keys(event)).toEqual(BASE_KEYS);
    expectNoContent(events, 'ada', 'base64', 'Renamed');
  });
});

describe('marketplace_bot_installed', () => {
  it('is captured only for a successful Marketplace install', async () => {
    const r = recorder();
    const registry = registryWith(r.capture);
    let next = 0;
    const methods = createBridgeMethods({
      registry,
      states: createBotStateTracker(),
      createBotId: () => `bot-${(next += 1)}`,
      telemetry: r.telemetry,
    } as unknown as Parameters<typeof createBridgeMethods>[0]);

    const installed = await methods.createFromGit({
      displayName: DISPLAY_NAME,
      gitUrl: GIT_URL,
      origin: 'marketplace',
    });
    expect(installed.ok).toBe(true);
    expect((await methods.createFromGit({ displayName: DISPLAY_NAME, gitUrl: GIT_URL })).ok).toBe(
      true,
    );
    expect((await methods.createFromGit({ displayName: '', origin: 'marketplace' })).ok).toBe(
      false,
    );

    const events = await r.events();
    expect(events.map((event) => event.event)).toEqual([
      'bot_created',
      'marketplace_bot_installed',
      'bot_created',
    ]);
    expect(keys(events[1])).toEqual(BASE_KEYS);
    expectNoContent(events, 'bot-1', 'someone', 'private-memory');
  });
});

describe('connector_enabled', () => {
  function messaging(platform: string, capture: (event: string, properties?: never) => void) {
    const home = tempDir('bh-telemetry-messaging-');
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const provider: MessagingProvider = {
      id: 'qa/provider',
      accounts: async () => [
        {
          ref: 'account-ref-secret',
          platform,
          name: 'Workspace Account Name',
          fingerprint: 'a'.repeat(64),
          connected: true,
        },
      ],
      targets: async () => [
        {
          ref: 'target-ref-secret',
          name: 'Workspace Group Name',
          digest: 'b'.repeat(64),
          receiveScope: { kind: 'group', conversationId: 'conversation-secret' },
        },
      ],
      async inspect(_account, target) {
        return {
          account: (await provider.accounts())[0]!,
          target: { ...(await provider.targets('account-ref-secret'))[0]!, ref: target },
        };
      },
      send: async () => ({ accepted: true }),
    };
    const service = createOutboundMessaging({
      database: attachOperationalModule(owner, 'messaging'),
      isBotActive: () => true,
      timeoutMs: 1000,
      capture: capture as never,
    });
    service.register(provider);
    cleanup.push(() => {
      service.close();
      owner.close();
    });
    return {
      service,
      bind: (slug: string) =>
        service.identity(slug, {
          kind: 'bind',
          providerId: provider.id,
          accountRef: 'account-ref-secret',
          fingerprint: 'a'.repeat(64),
        }),
      authorize: (slug: string) =>
        service.authorize({
          botSlug: slug,
          providerId: provider.id,
          accountRef: 'account-ref-secret',
          fingerprint: 'a'.repeat(64),
          targetRef: 'target-ref-secret',
          targetDigest: 'b'.repeat(64),
        }),
    };
  }

  const forbidden = [
    'account-ref-secret',
    'target-ref-secret',
    'conversation-secret',
    'Workspace Account Name',
    'Workspace Group Name',
    'aaaaaaaa',
    'qa/provider',
  ];

  it('captures the connector type when a Messaging Identity is bound', async () => {
    const r = recorder();
    const m = messaging('slack', r.capture);
    await m.bind('ada');
    const events = await r.events();
    expect(events.map((event) => event.event)).toEqual(['connector_enabled']);
    expect(keys(events[0])).toEqual([...BASE_KEYS, 'type'].sort());
    expect(events[0]!.properties['type']).toBe('slack');
    expectNoContent(events, ...forbidden);
  });

  it('captures a connector authorized without a prior binding once', async () => {
    const r = recorder();
    const m = messaging('feishu', r.capture);
    await m.authorize('ada');
    const events = await r.events();
    expect(events.map((event) => event.event)).toEqual(['connector_enabled']);
    expect(keys(events[0])).toEqual([...BASE_KEYS, 'type'].sort());
    expect(events[0]!.properties['type']).toBe('feishu');
    expectNoContent(events, ...forbidden);
  });

  it('captures re-enabling a paused identity but not pausing or renaming it', async () => {
    const r = recorder();
    const m = messaging('slack', r.capture);
    const bound = await m.bind('ada');
    const paused = await m.service.identity('ada', {
      kind: 'update',
      id: bound.id,
      expectedRevision: bound.revision,
      name: 'Workspace Account Name',
      enabled: false,
      inheritEnabled: false,
    });
    const resumed = await m.service.identity('ada', {
      kind: 'update',
      id: bound.id,
      expectedRevision: paused.revision,
      name: 'Workspace Account Name',
      enabled: true,
      inheritEnabled: false,
    });
    await m.service.identity('ada', {
      kind: 'update',
      id: bound.id,
      expectedRevision: resumed.revision,
      name: 'Renamed Account',
      enabled: true,
      inheritEnabled: false,
    });
    const events = await r.events();
    expect(events.map((event) => event.event)).toEqual(['connector_enabled', 'connector_enabled']);
    expectNoContent(events, ...forbidden, 'Renamed Account');
  });

  it('reduces unknown platforms to other', () => {
    expect(connectorType('Lark')).toBe('lark');
    expect(connectorType('weixin')).toBe('weixin');
    expect(connectorType('/Users/someone/custom')).toBe('other');
  });
});

describe('daily_usage', () => {
  it('reads PersonaBot, Session and message counts in a window', () => {
    const home = tempDir('bh-telemetry-usage-');
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    cleanup.push(() => owner.close());
    const port = attachOperationalModule(owner, 'telemetry-test');
    port.transaction((db) => {
      db.prepare('INSERT INTO persona_bots (slug, body) VALUES (?, ?)').run(
        'ada',
        JSON.stringify({ slug: 'ada', displayName: DISPLAY_NAME, workspaces: [], createdAt: '' }),
      );
      for (const [id, at] of <[string, string][]>[
        ['s-old', '2026-10-04T00:00:00.000Z'],
        ['s-1', '2026-10-05T12:00:00.000Z'],
        ['s-2', '2026-10-05T13:00:00.000Z'],
      ])
        db.prepare(
          "INSERT INTO session_ownership (session_id, bot_slug, root_role, created_at) VALUES (?, 'ada', 'orchestrator', ?)",
        ).run(id, at);
      for (const [id, kind, at] of <[string, string, string][]>[
        ['e-old', 'human-message', '2026-10-04T00:00:00.000Z'],
        ['e-1', 'human-message', '2026-10-05T12:00:00.000Z'],
        ['e-2', 'bot-message', '2026-10-05T12:01:00.000Z'],
        ['e-3', 'bridge-message', '2026-10-05T12:02:00.000Z'],
        ['e-4', 'system-message', '2026-10-05T12:03:00.000Z'],
      ])
        db.prepare(
          'INSERT INTO source_events (source_event_id, source_kind, body, created_at) VALUES (?, ?, ?, ?)',
        ).run(id, kind, PERSONA, at);
    });
    expect(
      readDailyUsageCounts(
        port,
        new Date('2026-10-05T00:00:00.000Z'),
        new Date('2026-10-06T00:00:00.000Z'),
      ),
    ).toEqual({ personaBots: 1, sessions: 2, messages: 3 });
  });

  it('sends one summary per day with exactly the count properties', async () => {
    vi.useFakeTimers();
    try {
      let now = new Date('2026-10-06T08:00:00.000Z');
      const r = recorder();
      const windows: [string, string][] = [];
      const start = () =>
        startDailyUsage({
          telemetry: r.telemetry,
          dataDir: r.dataDir,
          now: () => now,
          intervalMs: 1_000,
          counts: (since, until) => {
            windows.push([since.toISOString(), until.toISOString()]);
            return { personaBots: 3, sessions: 4, messages: 25 };
          },
        });
      const stop = start();
      expect(windows).toEqual([['2026-10-05T08:00:00.000Z', '2026-10-06T08:00:00.000Z']]);
      stop();
      now = new Date('2026-10-06T20:00:00.000Z');
      const restarted = start();
      expect(windows).toHaveLength(1);
      now = new Date('2026-10-07T08:00:00.000Z');
      await vi.advanceTimersByTimeAsync(1_000);
      expect(windows).toEqual([
        ['2026-10-05T08:00:00.000Z', '2026-10-06T08:00:00.000Z'],
        ['2026-10-06T08:00:00.000Z', '2026-10-07T08:00:00.000Z'],
      ]);
      restarted();
      now = new Date(now.getTime() + 2 * DAILY_USAGE_PERIOD_MS);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(windows).toHaveLength(2);

      const events = await r.events();
      expect(events.map((event) => event.event)).toEqual(['daily_usage', 'daily_usage']);
      expect(keys(events[0])).toEqual(
        [...BASE_KEYS, 'messages', 'persona_bots', 'sessions', 'window_hours'].sort(),
      );
      expect(events[0]!.properties).toMatchObject({
        persona_bots: 3,
        sessions: 4,
        messages: 25,
        window_hours: 24,
      });
      expect(JSON.parse(readFileSync(join(r.dataDir, INSTALL_ID_FILE), 'utf8'))).toEqual({
        installId: events[0]!.distinct_id,
        dailyUsageAt: '2026-10-07T08:00:00.000Z',
      });
      expectNoContent(events);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps counts as non-negative integers', () => {
    expect(
      dailyUsageProperties(
        { personaBots: -1, sessions: 2.7, messages: Number.NaN },
        37.6 * 3_600_000,
      ),
    ).toEqual({
      persona_bots: 0,
      sessions: 2,
      messages: 0,
      window_hours: 38,
    });
  });

  it('captures and persists nothing when telemetry is off', async () => {
    const r = recorder(telemetryDecision(true, { DO_NOT_TRACK: '1' }));
    const counts = vi.fn(() => ({ personaBots: 1, sessions: 1, messages: 1 }));
    const stop = startDailyUsage({ telemetry: r.telemetry, dataDir: r.dataDir, counts });
    stop();
    await r.events();
    expect(counts).not.toHaveBeenCalled();
    expect(r.send).not.toHaveBeenCalled();
    expect(existsSync(join(r.dataDir, INSTALL_ID_FILE))).toBe(false);
  });
});

describe('$exception', () => {
  const HOME = '/Users/someone';
  const OWN = { home: HOME, ownRoots: [`${HOME}/src/BotHarness/packages/core`] };

  function failure(): Error {
    const error = new TypeError(`cannot read ${PERSONA} from ${HOME}/notes/secret.md`);
    error.stack = [
      `TypeError: cannot read ${PERSONA}`,
      `with a second line of ${DISPLAY_NAME}`,
      `    at readMemory (${HOME}/.dsh/profile/node_modules/@botharness/core/dist/index.mjs:10:5)`,
      `    at async Promise.all (index 0)`,
      `    at Object.<anonymous> (file://${HOME}/.dsh/plugins/other/lib/index.js:3:1)`,
      `    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)`,
      `    at C:\\Users\\someone\\dsh\\node_modules\\dep\\index.js:1:2`,
    ].join('\n');
    return error;
  }

  it('sanitizes to the error type and a path-free stack without the message', () => {
    const exception = sanitizeException(failure(), 'onuncaughtexception', OWN)!;
    expect(Object.keys(exception).sort()).toEqual(['mechanism', 'stacktrace', 'type']);
    expect(exception.type).toBe('TypeError');
    expect(exception.mechanism).toEqual({ type: 'onuncaughtexception', handled: false });
    const frames = exception.stacktrace.frames;
    expect(frames.map((frame) => frame.function)).toEqual([
      '<anonymous>',
      'process.processTicksAndRejections',
      'Object.<anonymous>',
      'async Promise.all',
      'readMemory',
    ]);
    expect(frames[4]).toEqual({
      platform: 'node:javascript',
      function: 'readMemory',
      filename: '@botharness/core/dist/index.mjs',
      abs_path: '@botharness/core/dist/index.mjs',
      lineno: 10,
      colno: 5,
      in_app: true,
    });
    expect(frames.map((frame) => frame.filename)).toEqual([
      'dep/index.js',
      'node:internal/process/task_queues',
      'index.js',
      'index 0',
      '@botharness/core/dist/index.mjs',
    ]);
    expect(frames.map((frame) => frame.in_app)).toEqual([false, false, false, false, true]);
    for (const frame of frames) {
      expect(frame.filename).not.toContain('~');
      expect(frame.filename).not.toContain(HOME);
      expect(frame.filename).not.toMatch(/node_modules|\\|^\/|^[A-Za-z]:[\\/]/u);
      expect(frame.abs_path).toBe(frame.filename);
    }
    const serialized = JSON.stringify(exception);
    for (const forbidden of [PERSONA, DISPLAY_NAME, 'someone', 'secret.md', 'cannot read']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('never trusts an arbitrary error name or a non-Error reason', () => {
    const error = new Error('boom');
    error.name = `${PERSONA} /Users/someone`;
    error.stack = `${error.name}: boom\n    at run (${HOME}/src/BotHarness/packages/core/dist/index.mjs:1:1)`;
    const own = sanitizeException(error, 'onuncaughtexception', OWN)!;
    expect(own.type).toBe('Error');
    expect(own.stacktrace.frames.map((frame) => [frame.filename, frame.in_app])).toEqual([
      ['index.mjs', true],
    ]);
    expect(sanitizeException(PERSONA, 'onunhandledrejection', OWN)).toBeUndefined();
    expect(scrubHomePaths('/home/alice/x and /Users/bob/y', '/root')).toBe('~/x and ~/y');
  });

  it('drops errors without a BotHarness frame before anything is written', () => {
    const dataDir = tempDir();
    const foreign = new Error('other plugin failed');
    foreign.stack = [
      'Error: other plugin failed',
      `    at handler (${HOME}/.dsh/node_modules/other-plugin/lib/index.js:1:1)`,
      `    at run (${HOME}/src/BotHarness-fork/packages/core/dist/index.mjs:2:2)`,
      '    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)',
    ].join('\n');
    expect(sanitizeException(foreign, 'onuncaughtexception', OWN)).toBeUndefined();
    const proc = new EventEmitter();
    const uninstall = installExceptionCapture({
      dataDir,
      proc: proc as unknown as ExceptionCaptureProcess,
      ...OWN,
    });
    proc.emit('uncaughtExceptionMonitor', foreign, 'uncaughtException');
    uninstall();
    expect(existsSync(join(dataDir, PENDING_EXCEPTIONS_FILE))).toBe(false);
  });

  it('records unhandled errors synchronously and sends them as $exception on the next start', async () => {
    const r = recorder();
    const proc = new EventEmitter();
    const hostRejection = vi.fn();
    proc.on('unhandledRejection', hostRejection);
    const uninstall = installExceptionCapture({
      dataDir: r.dataDir,
      proc: proc as unknown as ExceptionCaptureProcess,
      ...OWN,
      now: () => new Date('2026-10-06T09:00:00.000Z'),
    });
    expect(proc.listeners('unhandledRejection')[1]).toBe(hostRejection);
    proc.emit('uncaughtExceptionMonitor', failure(), 'uncaughtException');
    proc.emit('unhandledRejection', failure());
    expect(hostRejection).toHaveBeenCalledOnce();
    uninstall();
    expect(proc.listenerCount('uncaughtExceptionMonitor')).toBe(0);
    expect(proc.listeners('unhandledRejection')).toEqual([hostRejection]);
    expect(r.send).not.toHaveBeenCalled();

    expect(deliverPendingExceptions(r.telemetry, r.dataDir)).toBe(2);
    expect(existsSync(join(r.dataDir, PENDING_EXCEPTIONS_FILE))).toBe(false);
    const events = await r.events();
    expect(events.map((event) => event.event)).toEqual(['$exception', '$exception']);
    expect(events[0]!.timestamp).toBe('2026-10-06T09:00:00.000Z');
    for (const event of events) {
      expect(keys(event)).toEqual([...BASE_KEYS, '$exception_level', '$exception_list'].sort());
    }
    const lists = events.map(
      (event) => event.properties['$exception_list'] as { mechanism: { type: string } }[],
    );
    expect(lists.map((list) => list[0]!.mechanism.type)).toEqual([
      'onuncaughtexception',
      'onunhandledrejection',
    ]);
    const serialized = JSON.stringify(events);
    for (const forbidden of [PERSONA, DISPLAY_NAME, 'someone', 'secret.md', r.dataDir]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('adds no unhandledRejection listener when the Host has none, keeping the default crash', () => {
    const proc = new EventEmitter();
    const uninstall = installExceptionCapture({
      dataDir: tempDir(),
      proc: proc as unknown as ExceptionCaptureProcess,
    });
    expect(proc.listenerCount('unhandledRejection')).toBe(0);
    expect(proc.listenerCount('uncaughtExceptionMonitor')).toBe(1);
    uninstall();
    expect(proc.listenerCount('uncaughtExceptionMonitor')).toBe(0);
  });

  it('drops recorded exceptions without sending when telemetry is off', async () => {
    const r = recorder(telemetryDecision(false, {}));
    const proc = new EventEmitter();
    installExceptionCapture({
      dataDir: r.dataDir,
      proc: proc as unknown as ExceptionCaptureProcess,
      ...OWN,
    })();
    writeFileSync(
      join(r.dataDir, PENDING_EXCEPTIONS_FILE),
      JSON.stringify([
        {
          at: '2026-10-06T09:00:00.000Z',
          exception: sanitizeException(failure(), 'onuncaughtexception', OWN),
        },
      ]),
    );
    expect(deliverPendingExceptions(r.telemetry, r.dataDir)).toBe(0);
    await r.events();
    expect(r.send).not.toHaveBeenCalled();
    expect(existsSync(join(r.dataDir, PENDING_EXCEPTIONS_FILE))).toBe(false);
  });
});

describe('the Human telemetry preference', () => {
  const OWN = { home: '/Users/someone', ownRoots: ['/opt/BotHarness/packages/core'] };

  function ownFailure(): Error {
    const error = new Error('failed');
    error.stack = `Error: failed\n    at run (/opt/BotHarness/packages/core/dist/index.mjs:1:1)`;
    return error;
  }

  it('pauses every #952 event while switched off and resumes when switched on', async () => {
    vi.useFakeTimers();
    try {
      let now = new Date('2026-10-06T08:00:00.000Z');
      const r = recorder();
      const registry = registryWith(r.capture);
      const proc = new EventEmitter();
      const counts = vi.fn(() => ({ personaBots: 1, sessions: 0, messages: 0 }));
      r.telemetry.setPreference(false);
      const stopUsage = startDailyUsage({
        telemetry: r.telemetry,
        dataDir: r.dataDir,
        now: () => now,
        intervalMs: 1_000,
        counts,
      });
      const uninstall = installExceptionCapture({
        dataDir: r.dataDir,
        proc: proc as unknown as ExceptionCaptureProcess,
        enabled: () => r.telemetry.enabled,
        ...OWN,
      });

      registry.create({ slug: 'ada', displayName: DISPLAY_NAME });
      proc.emit('uncaughtExceptionMonitor', ownFailure(), 'uncaughtException');
      await vi.advanceTimersByTimeAsync(1_000);
      expect(counts).not.toHaveBeenCalled();
      expect(existsSync(join(r.dataDir, PENDING_EXCEPTIONS_FILE))).toBe(false);
      expect(deliverPendingExceptions(r.telemetry, r.dataDir)).toBe(0);
      expect(await r.events()).toEqual([]);

      r.telemetry.setPreference(true);
      registry.setPaused('ada', true);
      proc.emit('uncaughtExceptionMonitor', ownFailure(), 'uncaughtException');
      now = new Date('2026-10-06T08:00:01.000Z');
      await vi.advanceTimersByTimeAsync(1_000);
      expect(counts).toHaveBeenCalledOnce();
      expect(deliverPendingExceptions(r.telemetry, r.dataDir)).toBe(1);
      uninstall();
      stopUsage();
      expect((await r.events()).map((event) => event.event)).toEqual([
        'bot_archived',
        'daily_usage',
        '$exception',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps installId, the preference and dailyUsageAt across each other’s writes', () => {
    const dataDir = tempDir();
    const id = ensureInstallId(dataDir, () => '00000000-0000-4000-8000-000000000001');
    writeDailyUsageAt(dataDir, new Date('2026-10-06T08:00:00.000Z'));
    writeTelemetryPreference(dataDir, false);
    const read = () => JSON.parse(readFileSync(join(dataDir, INSTALL_ID_FILE), 'utf8')) as unknown;
    expect(read()).toEqual({
      installId: id,
      dailyUsageAt: '2026-10-06T08:00:00.000Z',
      enabled: false,
    });
    writeDailyUsageAt(dataDir, new Date('2026-10-07T08:00:00.000Z'));
    expect(read()).toEqual({
      installId: id,
      dailyUsageAt: '2026-10-07T08:00:00.000Z',
      enabled: false,
    });
    writeTelemetryPreference(dataDir, true);
    expect(read()).toEqual({ installId: id, dailyUsageAt: '2026-10-07T08:00:00.000Z' });
    expect(readTelemetryPreference(dataDir)).toBe(true);
    expect(readDailyUsageAt(dataDir)?.toISOString()).toBe('2026-10-07T08:00:00.000Z');
    expect(ensureInstallId(dataDir)).toBe(id);
  });
});
