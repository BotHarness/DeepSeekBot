import { afterEach, expect, it, vi } from 'vitest';
import {
  BotCreationFailure,
  createBotCreationController,
  type BotCreationPort,
  type CreationReceipt,
  type CreationRecord,
} from '../src/host/bot-creation';
import { createMobileTelemetry } from '../src/telemetry/mobile-telemetry';
import { sanitizeEvent, type BotOperationKind, type TelemetryEvent } from '../src/telemetry/schema';

const dispose: (() => void)[] = [];
afterEach(() => dispose.splice(0).forEach((close) => close()));
const privateText = 'PRIVATE-content-host-name-secret';
const draft = {
  hostId: privateText,
  displayName: privateText,
  persona: privateText,
  description: privateText,
  tags: privateText,
};
const file = {
  fileId: '12345678-1234-1234-1234-123456789abc',
  fileName: `${privateText}.zip`,
  sha256: 'a'.repeat(64),
  sizeBytes: 30,
};

async function setup(kind: BotOperationKind = 'blank', collect = true) {
  const sent: TelemetryEvent[] = [];
  let statistics: unknown;
  let disk: CreationRecord | undefined;
  let canonical: CreationReceipt | null = null;
  let sequence = 0;
  let clock = 0;
  const telemetry = createMobileTelemetry({
    collect,
    storage: {
      read: async () => statistics,
      write: (value) => {
        statistics = structuredClone(value);
      },
    },
    sender: async (batch) => {
      sent.push(...structuredClone(batch));
    },
    uuid: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    now: () => Date.parse('2026-10-24T00:00:00Z'),
    monotonic: () => clock,
    context: {
      platform: 'android',
      app_version: '2.0.0',
      app_build: '12',
      environment: 'development',
      language: 'en',
    },
  });
  dispose.push(() => telemetry.dispose());
  await telemetry.ready;
  telemetry.foreground(true, 1);
  const create = vi.fn<BotCreationPort['create']>(async (operation) => {
    canonical = {
      operationKey: operation.operationKey,
      botSlug: privateText,
      status: 'created',
      channelId: privateText,
    };
    return canonical;
  });
  const lookup = vi.fn<BotCreationPort['lookup']>(async () => canonical);
  const port: BotCreationPort = {
    deviceId: () => privateText,
    create,
    lookup,
    preview: async (_target, gitUrl) => ({ kind: 'git', gitUrl, commit: 'b'.repeat(40) }),
    pickZip: async () => file,
    previewZip: async (_target, source) => ({ source, displayName: privateText }),
  };
  const storage = {
    read: async () => disk,
    write: async (record: CreationRecord) => {
      disk = structuredClone(record);
    },
  };
  const make = () =>
    createBotCreationController({
      storage,
      port,
      key: () => `${privateText}-${++sequence}`,
      telemetry,
    });
  const controller = make();
  await controller.edit(draft);
  if (kind === 'zip') await controller.beginZip();
  if (kind === 'git' || kind === 'marketplace')
    await controller.beginImport({
      gitUrl: `https://private.example/${privateText}.git`,
      ...(kind === 'marketplace' ? { origin: 'marketplace', listingId: privateText } : {}),
    });
  return {
    controller,
    make,
    port,
    storage,
    telemetry,
    create,
    lookup,
    canonical: () => canonical,
    disk: () => disk,
    advance: () => {
      clock += 1700;
    },
    async events() {
      await telemetry.flush();
      return sent.filter((event) => event.event.startsWith('mobile_bot_operation_'));
    },
    statistics: () => statistics,
  };
}

it.each<BotOperationKind>(['blank', 'git', 'zip', 'marketplace'])(
  'observes %s previews and Host-confirmed creation without content',
  async (kind) => {
    const test = await setup(kind);
    if (kind !== 'blank') await test.controller.preview();
    await Promise.all([test.controller.submit(), test.controller.submit()]);
    await test.controller.resume();
    expect(test.create).toHaveBeenCalledTimes(1);
    const events = await test.events();
    expect(
      events.map((event) => [event.event, event.properties.phase, event.properties.outcome]),
    ).toEqual([
      ...(kind === 'blank'
        ? []
        : [
            ['mobile_bot_operation_started', 'preview', undefined],
            ['mobile_bot_operation_result', 'preview', 'preview_ready'],
          ]),
      ['mobile_bot_operation_started', 'submit', undefined],
      ['mobile_bot_operation_result', 'submit', 'created'],
    ]);
    for (let i = 0; i < events.length; i += 2) {
      expect(events[i]?.properties.kind).toBe(kind);
      expect(events[i + 1]?.properties.attempt_id).toBe(events[i]?.properties.attempt_id);
    }
    expect(JSON.stringify(events)).not.toContain(privateText);
    expect(JSON.stringify(test.statistics())).not.toContain(privateText);
    expect(
      events.every((event) => JSON.stringify(event) === JSON.stringify(sanitizeEvent(event))),
    ).toBe(true);
  },
);

it('keeps lost replies unknown and reports recovery separately after restart', async () => {
  const test = await setup();
  const original = test.port.create;
  test.port.create = async (...args) => {
    await original(...args);
    throw new BotCreationFailure('unreachable');
  };
  await test.controller.submit();
  expect(test.canonical()?.status).toBe('created');
  const reopened = test.make();
  await reopened.resume();
  await reopened.resume();
  const events = await test.events();
  expect(
    events
      .filter((event) => event.event === 'mobile_bot_operation_result')
      .map((event) => [event.properties.phase, event.properties.outcome, event.properties.reason]),
  ).toEqual([
    ['submit', 'unknown', 'transport'],
    ['recover', 'recovered', 'none'],
  ]);
  expect(
    new Set(
      events
        .filter((event) => event.event === 'mobile_bot_operation_started')
        .map((event) => event.properties.attempt_id),
    ).size,
  ).toBe(2);
  expect(test.create).toHaveBeenCalledTimes(1);
  const record = reopened.getSnapshot().record;
  expect(record.kind).toBe('submitted');
  if (record.kind !== 'submitted') throw new Error('expected submitted operation');
  await reopened.acknowledge(record.operation.operationKey);
  await test.make().resume();
  expect(await test.events()).toHaveLength(4);
});

it('reports reserved and absent recovery as pending, never as created', async () => {
  const test = await setup();
  test.create.mockImplementation(async (operation) => ({
    operationKey: operation.operationKey,
    botSlug: privateText,
    status: 'reserved',
  }));
  await test.controller.submit();
  expect((await test.events()).at(-1)?.properties.outcome).toBe('pending');
  const record = test.disk();
  if (record?.kind !== 'submitted') throw new Error('expected submitted operation');
  await test.storage.write({ ...record, mutationStarted: false });
  await test.make().resume();
  expect((await test.events()).at(-1)?.properties).toMatchObject({
    phase: 'recover',
    outcome: 'pending',
  });
  expect(test.create).toHaveBeenCalledTimes(1);
});

it.each([
  ['target-unpaired', 'refused', 'target-unavailable'],
  ['host-update-required', 'refused', 'host-update-required'],
  ['git-source-changed', 'refused', 'source-changed'],
  ['storage-write', 'failed', 'storage'],
  [privateText, 'unknown', 'unknown'],
])('normalizes %s without exporting arbitrary errors', async (code, outcome, reason) => {
  const test = await setup();
  test.lookup.mockRejectedValueOnce(new BotCreationFailure(code));
  await test.controller.submit();
  const events = await test.events();
  expect(events.at(-1)?.properties).toMatchObject({ outcome, reason });
  expect(JSON.stringify(events)).not.toContain(privateText);
});

it('measures failed preview and pre-submit validation without a create request', async () => {
  const test = await setup('git');
  test.port.preview = async () => {
    throw new BotCreationFailure('git-source-changed');
  };
  await test.controller.preview();
  await test.controller.submit();
  expect(test.create).not.toHaveBeenCalled();
  const events = await test.events();
  expect(
    events
      .filter((event) => event.event === 'mobile_bot_operation_result')
      .map((event) => event.properties.reason),
  ).toEqual(['source-changed', 'validation']);
});

it('does not observe draft edits, file-picker cancellation, or empty recovery', async () => {
  const test = await setup();
  test.port.pickZip = async () => null;
  await test.controller.beginZip();
  await test.controller.preview();
  await test.controller.resume();
  expect(await test.events()).toEqual([]);
});

it('drops a result across opt-out/re-enable and does not backfill an unconfigured start', async () => {
  const test = await setup();
  const attempt = test.telemetry.botOperation('zip', 'submit');
  await test.telemetry.setEnabled(false);
  await test.telemetry.setEnabled(true);
  attempt.finish('created');
  expect(await test.events()).toEqual([]);
  const unconfigured = await setup('blank', false);
  await unconfigured.controller.submit();
  expect(unconfigured.create).toHaveBeenCalledTimes(1);
  expect(await unconfigured.events()).toEqual([]);
});

it('pins the foreground session, buckets duration, and emits one terminal event', async () => {
  const test = await setup();
  const attempt = test.telemetry.botOperation('git', 'submit');
  test.advance();
  attempt.finish('created');
  attempt.finish('created');
  const events = await test.events();
  expect(events).toHaveLength(2);
  expect(events[1]?.properties).toMatchObject({
    duration_bucket: '1-5s',
    foreground_session_id: events[0]?.properties.foreground_session_id,
  });
});

it('cannot fail product creation when the observer throws', async () => {
  const test = await setup();
  const broken = createBotCreationController({
    storage: test.storage,
    port: test.port,
    key: () => 'operation-throw-test',
    telemetry: {
      botOperation() {
        throw new Error(privateText);
      },
    },
  });
  await broken.submit();
  expect(broken.getSnapshot().receipt?.status).toBe('created');
  expect(broken.getSnapshot().error).toBeUndefined();
});
