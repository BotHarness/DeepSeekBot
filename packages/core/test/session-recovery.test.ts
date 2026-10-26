import { afterEach, expect, it } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createTempRoot } from './helpers.js';

const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

async function fixture(sideEffect = false) {
  const archived = new Set<string>();
  const runs: string[] = [];
  const loaded: string[] = [];
  const core = createCore({
    dshHome: createTempRoot('bh-session-recovery-'),
    agents: {
      runOrchestrator: async (run) => {
        runs.push(run.sessionId);
        if (runs.length === 1) {
          if (sideEffect) await run.channels.send({ body: 'Already sent' });
          throw new Error('Agent turn ended without completion: max-tokens');
        }
      },
      loadOrchestrator: async (run) => {
        loaded.push(run.sessionId);
      },
      runAssignment: async () => {},
      requestAssignment: () => ({ delivery: 'steer' }),
      close: async () => {},
    },
    sessionArchive: () => ({
      archiveSession: async (id) => {
        archived.add(id);
      },
      unarchiveSession: async (id) => {
        archived.delete(id);
      },
    }),
    workspaces: () => ({ get: () => undefined, list: () => [], archivedSessionIds: [...archived] }),
  });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
  await core.channels.appendMessage(dm.id, {
    id: 'human-request',
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body: 'Hello',
  });
  const admission = core.runtime.admitDmMessage({
    channelId: dm.id,
    messageId: 'human-request',
    body: 'Hello',
  });
  if (!admission.admitted) throw new Error(admission.reason);
  await admission.settled.catch(() => undefined);
  await core.runtime.whenIdle();
  const failure = core.channels.readMessages(dm.id).find((message) => message.sessionFailure);
  if (!failure) throw new Error('Missing failure');
  return {
    core,
    dm,
    failure,
    runs,
    loaded,
    archived,
    input: { channelId: dm.id, failureMessageId: failure.id },
    methods: createBridgeMethods({ ...core }),
  };
}

it('starts a fresh Session and retries only the original request while retaining history', async () => {
  const fx = await fixture();
  await fx.core.runtime.recoverDmMessage!({
    ...fx.input,
    action: 'new-session',
    compact: async () => false,
  });
  await fx.core.runtime.whenIdle();
  expect(fx.runs).toHaveLength(2);
  expect(fx.runs[1] === fx.runs[0]).toBe(false);
  expect(fx.archived.has(fx.runs[0]!)).toBe(true);
  expect(fx.core.channels.message(fx.dm.id, 'human-request')?.body).toBe('Hello');
  await expect(
    fx.core.runtime.recoverDmMessage!({
      ...fx.input,
      action: 'new-session',
      compact: async () => true,
    }),
  ).rejects.toMatchObject({ code: 'session-changed' });
});

it('loads a cold Session, serializes concurrent recovery, and retries after compaction', async () => {
  const fx = await fixture();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const recovery = fx.core.runtime.recoverDmMessage!({
    ...fx.input,
    action: 'compact',
    compact: async () => {
      await gate;
      return true;
    },
  });
  await expect(
    fx.core.runtime.recoverDmMessage!({
      ...fx.input,
      action: 'new-session',
      compact: async () => true,
    }),
  ).rejects.toMatchObject({ code: 'bot-busy' });
  release();
  await recovery;
  await fx.core.runtime.whenIdle();
  expect(fx.loaded).toEqual([fx.runs[0]]);
  expect(fx.runs).toEqual([fx.runs[0], fx.runs[0]]);
  expect(fx.archived.size).toBe(0);
});

it('does not retry or replace when compaction cannot produce a useful summary', async () => {
  const fx = await fixture();
  await expect(
    fx.core.runtime.recoverDmMessage!({
      ...fx.input,
      action: 'compact',
      compact: async () => false,
    }),
  ).rejects.toMatchObject({ code: 'compaction-failed' });
  expect(fx.runs).toHaveLength(1);
  expect(fx.archived.size).toBe(0);
});

it('queues a new message during recovery without interrupting compaction', async () => {
  const fx = await fixture();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const recovery = fx.core.runtime.recoverDmMessage!({
    ...fx.input,
    action: 'compact',
    compact: async () => {
      await gate;
      return true;
    },
  });
  await fx.core.channels.appendMessage(fx.dm.id, {
    id: 'later-request',
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body: 'Later',
  });
  const next = fx.core.runtime.admitDmMessage({
    channelId: fx.dm.id,
    messageId: 'later-request',
    body: 'Later',
  });
  expect(fx.runs).toHaveLength(1);
  release();
  await recovery;
  if (next.admitted) await next.settled;
  await fx.core.runtime.whenIdle();
  expect(fx.runs.length).toBeGreaterThan(1);
  expect(fx.archived.size).toBe(0);
});

it('does not reset a Session when the failed request already started an external effect', async () => {
  const fx = await fixture(true);
  await expect(
    fx.core.runtime.recoverDmMessage!({
      ...fx.input,
      action: 'new-session',
      compact: async () => true,
    }),
  ).rejects.toMatchObject({ code: 'retry-unavailable' });
  expect(fx.archived.size).toBe(0);
});

it('refuses mismatched failure references before changing a Session', async () => {
  const fx = await fixture();
  const result = await fx.methods.channelRetry({
    ...fx.input,
    messageId: 'other-request',
    recovery: 'new-session',
  });
  expect(result.ok).toBe(false);
  expect(fx.archived.size).toBe(0);
});
