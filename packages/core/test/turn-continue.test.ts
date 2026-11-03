import { afterEach, expect, it } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createTempRoot } from './helpers.js';

const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

const settle = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, ms = 5_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting');
    await settle(10);
  }
}

async function fixture(
  orchestrate: (run: OrchestratorAgentRun, index: number) => Promise<void>,
  autoContinueDelaysMs: readonly number[] = [60_000, 180_000],
) {
  const runs: OrchestratorAgentRun[] = [];
  const archived = new Set<string>();
  const core = createCore({
    dshHome: createTempRoot('bh-turn-continue-'),
    autoContinueDelaysMs,
    readTurnProgress: async () => ({
      completedSteps: 3,
      lastTool: 'bash',
      unknownTools: ['bash'],
    }),
    agents: {
      runOrchestrator: async (run) => {
        runs.push(run);
        await orchestrate(run, runs.length);
      },
      loadOrchestrator: async () => {},
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
    workspaces: () => ({
      get: () => undefined,
      list: () => [],
      archivedSessionIds: [...archived],
    }),
  });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
  const send = async (id: string, body: string) => {
    await core.channels.appendMessage(dm.id, {
      id,
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body,
    });
    const admission = core.runtime.admitDmMessage({
      channelId: dm.id,
      messageId: id,
      body,
    });
    if (!admission.admitted) throw new Error(admission.reason);
    await admission.settled.catch(() => undefined);
    await core.runtime.whenIdle();
  };
  await send('human-request', 'Migrate the whole repo');
  const failures = () =>
    core.channels.readMessages(dm.id).filter((message) => message.sessionFailure !== undefined);
  return {
    core,
    dm,
    runs,
    send,
    failures,
    methods: createBridgeMethods({ ...core }),
  };
}

function attemptState(core: BotHarnessCore, messageId: string): string | undefined {
  return attachOperationalModule(core.operationalDatabase, 'turn-continue-test').read((db) => {
    const row = db
      .prepare('SELECT attempt_state FROM source_events WHERE message_id = ?')
      .get(messageId) as { attempt_state: string } | undefined;
    return row?.attempt_state;
  });
}

it('continues a turn in its Session after it already sent a message, without replaying it', async () => {
  const fx = await fixture(async (run, index) => {
    if (index === 1) {
      await run.channels.send({ body: 'Step 1 of 5 done' });
      throw new Error('Agent turn ended without completion: max-tokens');
    }
    await run.channels.send({ body: 'All done' });
  });
  const [failure] = fx.failures();
  expect(failure?.sessionFailure).toMatchObject({
    requestMessageId: 'human-request',
    progress: { completedSteps: 3, lastTool: 'bash', unknownTools: ['bash'] },
  });
  expect(failure?.sessionFailure?.autoContinue).toBeUndefined();
  await expect(fx.core.runtime.retryDmMessage!(fx.dm.id, 'human-request')).rejects.toThrow(
    'cannot be safely retried',
  );

  const result = await fx.methods.channelRetry({
    channelId: fx.dm.id,
    messageId: 'human-request',
    recovery: 'continue',
    failureMessageId: failure!.id,
  });
  expect(result).toEqual({ ok: true, value: { accepted: true } });
  await fx.core.runtime.whenIdle();

  expect(fx.runs).toHaveLength(2);
  expect(fx.runs[1]!.sessionId).toBe(fx.runs[0]!.sessionId);
  expect(fx.runs[1]!.message).toMatch(
    /^\[Host: your earlier turn for the message below stopped before it finished because it failed\./,
  );
  expect(fx.runs[1]!.message).toContain('Migrate the whole repo');
  expect(attemptState(fx.core, 'human-request')).toBe('handled');
  await expect(
    fx.methods.channelRetry({
      channelId: fx.dm.id,
      messageId: 'human-request',
      recovery: 'continue',
      failureMessageId: failure!.id,
    }),
  ).resolves.toMatchObject({ ok: false, error: { code: 'retry-unavailable' } });
});

it('continues a transient failure by itself, twice at most, then waits for the Human', async () => {
  const fx = await fixture(async () => {
    throw new Error('TRANSPORT: socket hang up');
  }, [5, 5]);
  await until(() => fx.failures().length === 3);
  await settle(60);
  await fx.core.runtime.whenIdle();
  expect(fx.runs).toHaveLength(3);
  expect(new Set(fx.runs.map((run) => run.sessionId)).size).toBe(1);
  expect(fx.runs[1]!.message).toContain('because it failed with TRANSPORT');
  const cards = fx
    .failures()
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((message) => message.sessionFailure?.autoContinue);
  expect(cards.map((auto) => auto?.attempt)).toEqual([1, 2, undefined]);
  expect(cards[0]?.maxAttempts).toBe(2);
  expect(attemptState(fx.core, 'human-request')).toBe('retryable');
});

it('does not continue by itself after errors that would fail the same way again', async () => {
  const fx = await fixture(async () => {
    throw new Error('AUTH: invalid api key');
  }, [5, 5]);
  await settle(60);
  expect(fx.runs).toHaveLength(1);
  expect(fx.failures()[0]?.sessionFailure?.autoContinue).toBeUndefined();
});

it('Stop cancels a waiting automatic continuation and a new Human message replaces it', async () => {
  const stopped = await fixture(async () => {
    throw new Error('RATE_LIMIT: slow down');
  }, [30, 30]);
  const sessionId = stopped.runs[0]!.sessionId;
  const dmId = stopped.dm.id;
  for (const scope of [
    { autoContinueFor: 'human-other', channelId: dmId },
    { autoContinueFor: 'human-request', channelId: 'group-elsewhere' },
  ])
    await expect(stopped.core.runtime.stopTurn!('ada', scope)).resolves.toBeUndefined();
  const scope = { autoContinueFor: 'human-request', channelId: dmId };
  await expect(stopped.core.runtime.stopTurn!('ada', scope)).resolves.toEqual({ sessionId });
  await expect(stopped.core.runtime.stopTurn!('ada', scope)).resolves.toBeUndefined();
  await expect(stopped.core.runtime.stopTurn!('ada')).resolves.toBeUndefined();
  await settle(80);
  expect(stopped.runs).toHaveLength(1);

  const replaced = await fixture(
    async (_run, index) => {
      if (index === 1) throw new Error('SERVER: 502');
    },
    [30, 30],
  );
  await replaced.send('human-next', 'Actually do something else');
  await settle(80);
  await replaced.core.runtime.whenIdle();
  expect(replaced.runs).toHaveLength(2);
  expect(replaced.runs[1]!.message).not.toContain('[Host: your earlier turn');
  expect(attemptState(replaced.core, 'human-request')).toBe('retryable');
});

it('refuses to continue in a Session that was replaced', async () => {
  const fx = await fixture(async (_run, index) => {
    if (index === 1) throw new Error('Agent turn ended without completion: max-tokens');
  });
  const failure = fx.failures()[0]!;
  expect(await fx.core.runtime.startFreshOrchestrator!('ada')).toBe('started');
  expect(fx.core.runtime.currentOrchestratorSessionId!('ada')).not.toBe(fx.runs[0]!.sessionId);
  await expect(
    fx.core.runtime.recoverDmMessage!({
      channelId: fx.dm.id,
      failureMessageId: failure.id,
      action: 'continue',
      compact: async () => false,
    }),
  ).rejects.toMatchObject({ code: 'session-changed' });
  expect(fx.runs).toHaveLength(1);
});

it('re-arms a waiting automatic continuation after the Host restarts', async () => {
  const home = createTempRoot('bh-turn-continue-restart-');
  const sessions: string[] = [];
  const agents = (fail: boolean) => ({
    runOrchestrator: async (run: OrchestratorAgentRun) => {
      sessions.push(run.sessionId);
      if (fail) throw new Error('TIMEOUT: provider did not answer');
      await run.channels.send({ body: 'Done' });
    },
    loadOrchestrator: async () => {},
    runAssignment: async () => {},
    requestAssignment: () => ({ delivery: 'steer' as const }),
    close: async () => {},
  });
  const first = createCore({
    dshHome: home,
    autoContinueDelaysMs: [60_000],
    agents: agents(true),
  });
  first.registry.create({ slug: 'ada', displayName: 'Ada' });
  const dm = first.channels.getOrCreateDm('ada', 'Ada')!;
  await first.channels.appendMessage(dm.id, {
    id: 'human-request',
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body: 'Long job',
  });
  const admission = first.runtime.admitDmMessage({
    channelId: dm.id,
    messageId: 'human-request',
    body: 'Long job',
  });
  if (!admission.admitted) throw new Error(admission.reason);
  await admission.settled.catch(() => undefined);
  first.externalMessaging.close();
  await first.runtime.close();
  first.operationalDatabase.close();

  const second = createCore({
    dshHome: home,
    autoContinueDelaysMs: [1],
    agents: agents(false),
  });
  cores.push(second);
  await expect(second.runtime.stopTurn!('ada')).resolves.toEqual({
    sessionId: sessions[0],
  });
  await expect(second.runtime.stopTurn!('ada')).resolves.toBeUndefined();
  expect(sessions).toHaveLength(1);
});
