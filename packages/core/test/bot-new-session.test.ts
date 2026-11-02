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

async function fixture() {
  const archived = new Set<string>();
  const sessions: string[] = [];
  let archiveHook = () => {};
  let runHook = async () => {};
  const core = createCore({
    dshHome: createTempRoot('bh-new-session-'),
    agents: {
      runOrchestrator: async (run) => {
        sessions.push(run.sessionId);
        await runHook();
      },
      runAssignment: async () => {},
      requestAssignment: () => ({ delivery: 'steer' }),
      close: async () => {},
    },
    sessionArchive: () => ({
      archiveSession: async (id) => {
        archiveHook();
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
  let messageId = 0;
  const send = async () => {
    const admission = core.runtime.admitDmMessage({
      channelId: dm.id,
      messageId: `message-${++messageId}`,
      body: 'Hello',
    });
    if (!admission.admitted) throw new Error('Admission failed');
    await admission.settled;
  };
  return {
    core,
    archived,
    sessions,
    send,
    methods: createBridgeMethods({ ...core }),
    setArchiveHook: (hook: () => void) => {
      archiveHook = hook;
    },
    setRunHook: (hook: () => Promise<void>) => {
      runHook = hook;
    },
  };
}

it('retires the idle Orchestrator and starts the next message in a different Session', async () => {
  const fx = await fixture();
  await fx.send();
  expect(await fx.methods.botNewSession({ slug: 'ada' })).toEqual({
    ok: true,
    value: { started: true },
  });
  expect(fx.archived.has(fx.sessions[0]!)).toBe(true);
  await fx.send();
  expect(fx.sessions).toHaveLength(2);
  expect(fx.sessions[1]).not.toBe(fx.sessions[0]);
});

it('refuses a running Bot without retiring its Session', async () => {
  const fx = await fixture();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  fx.setRunHook(() => gate);
  const running = fx.send();
  try {
    expect(await fx.methods.botNewSession({ slug: 'ada' })).toMatchObject({
      ok: false,
      error: { code: 'bot-busy' },
    });
    expect(fx.archived.size).toBe(0);
  } finally {
    release();
    await running;
  }
});

it('restores the old Session when IM authority is withdrawn during archive', async () => {
  const fx = await fixture();
  await fx.send();
  let authorized = true;
  fx.setArchiveHook(() => {
    authorized = false;
  });
  await expect(
    fx.core.runtime.startFreshOrchestrator!('ada', () => {
      if (!authorized) throw new Error('Pairing revoked');
    }),
  ).rejects.toThrow('Pairing revoked');
  expect(fx.archived.size).toBe(0);
  await fx.send();
  expect(fx.sessions[1]).toBe(fx.sessions[0]);
});
