import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createChannelStore } from '../src/channels/store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createSessionOwnership } from '../src/sessions/ownership.js';
import {
  createBotRuntime,
  type BotAgentAdapter,
  type OrchestratorAgentRun,
} from '../src/runtime/bot-runtime.js';
import { createBotMessageTool } from '../src/runtime/bot-message-tool.js';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import { createTestRegistry } from './registry-fixture.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function fixture(holdTeardown = false) {
  const home = createTempRoot('bh-native-subagent-');
  const database = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const registry = createTestRegistry({ database, rootDir: join(home, 'bots') });
  registry.create({ slug: 'ada', displayName: 'Ada' });
  const channels = createChannelStore({ rootDir: join(home, 'channels') });
  const dm = channels.getOrCreateDm('ada', 'Ada')!;
  const ownership = createSessionOwnership(attachOperationalModule(database, 'session-ownership'));
  const at = '2026-10-25T00:00:00.000Z';
  ownership.claim({ sessionId: 'parent', botSlug: 'ada', rootRole: 'orchestrator', at });
  ownership.claim({
    sessionId: 'child',
    botSlug: 'ada',
    rootRole: 'orchestrator',
    parentSessionId: 'parent',
    provenance: 'subagent',
    at,
  });
  const finished = deferred<void>();
  const prepared = deferred<void>();
  const started = deferred<OrchestratorAgentRun>();
  const released = deferred<void>();
  const cleanup = deferred<void>();
  const runs: OrchestratorAgentRun[] = [];
  const archived = new Set<string>();
  const agents: BotAgentAdapter = {
    async runOrchestrator(run) {
      runs.push(run);
      started.resolve(run);
      await prepared.promise;
      run.setExecutionReady?.(true);
      try {
        if (run.acceptNativeInput?.() === false) return;
        await finished.promise;
      } finally {
        run.setExecutionReady?.(false);
        released.resolve();
        if (holdTeardown) await cleanup.promise;
      }
    },
    async runAssignment() {
      throw new Error('unexpected Assignment');
    },
    requestAssignment() {
      throw new Error('unexpected Assignment');
    },
    async close() {},
  };
  const runtime = createBotRuntime({
    database,
    registry,
    channels,
    agents,
    ownership,
    sessionArchived: (id) => archived.has(id),
  });
  return {
    runtime,
    registry,
    channels,
    ownership,
    dm,
    runs,
    finished,
    prepared,
    started,
    released,
    cleanup,
    archived,
  };
}

describe('native Subagent report admission', () => {
  it('waits for teardown when the previous tool context is already released', async () => {
    const f = fixture(true);
    try {
      f.prepared.resolve();
      expect(
        await f.runtime.prepareNativeOrchestratorStep!(
          'parent',
          ['child'],
          new AbortController().signal,
        ),
      ).toBe(true);
      f.finished.resolve();
      await f.released.promise;
      let admitted = false;
      const next = f.runtime.prepareNativeOrchestratorStep!(
        'parent',
        ['child'],
        new AbortController().signal,
      ).then((result) => {
        admitted = result;
        return result;
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(admitted).toBe(false);
      expect(f.runs).toHaveLength(1);
      f.cleanup.resolve();
      expect(await next).toBe(true);
      expect(f.runs).toHaveLength(2);
    } finally {
      f.prepared.resolve();
      f.finished.resolve();
      f.cleanup.resolve();
      await f.runtime.close();
    }
  });
  it('restores a source-free runtime until the native turn ends and sends explicitly once', async () => {
    const f = fixture();
    try {
      const accepted = f.runtime.prepareNativeOrchestratorStep!(
        'parent',
        ['child'],
        new AbortController().signal,
      );
      const run = await f.started.promise;
      f.prepared.resolve();
      expect(await accepted).toBe(true);
      expect(run.message).toBe('');
      expect(run.inboundChannelId).toBeUndefined();
      expect(run.triage?.current()).toEqual([]);
      expect(f.runtime.canRequestPrivateInput?.('parent')).toBe(false);
      expect(f.runtime.turnRunning?.('ada')).toBe(true);
      let concluded = false;
      const result = await createBotMessageTool(() => run).execute(
        { channel_id: f.dm.id, body: 'Background result', end_turn: true },
        {
          callId: ToolCallId('native-report'),
          signal: new AbortController().signal,
          concludeTurn: () => {
            concluded = true;
          },
        } as ToolRunContext,
      );
      expect(typeof result === 'string' ? JSON.parse(result) : result).toMatchObject({
        status: 'committed',
      });
      expect(concluded).toBe(true);
      expect(f.channels.readMessages(f.dm.id).map((m) => m.body)).toEqual(['Background result']);
      expect(
        await f.runtime.prepareNativeOrchestratorStep!('parent', [], new AbortController().signal),
      ).toBe(true);
      expect(f.runs).toHaveLength(1);
    } finally {
      f.prepared.resolve();
      f.finished.resolve();
      await f.runtime.whenIdle();
      expect(f.runtime.turnRunning?.('ada')).toBe(false);
      await f.runtime.close();
    }
  });

  it.each(['unknown-child', 'no-sender', 'archived', 'paused', 'aborted'] as const)(
    'refuses %s before starting a runtime',
    async (caseName) => {
      const f = fixture();
      const controller = new AbortController();
      if (caseName === 'archived') f.archived.add('parent');
      if (caseName === 'paused') f.registry.setPaused('ada', true);
      if (caseName === 'aborted') controller.abort();
      try {
        expect(
          await f.runtime.prepareNativeOrchestratorStep!(
            'parent',
            caseName === 'unknown-child' ? ['unowned'] : caseName === 'no-sender' ? [] : ['child'],
            controller.signal,
          ),
        ).toBe(false);
        expect(f.runs).toHaveLength(0);
      } finally {
        f.prepared.resolve();
        f.finished.resolve();
        await f.runtime.close();
      }
    },
  );

  it('cancels while preparing without leaving a waiter or accepting a report', async () => {
    const f = fixture();
    const controller = new AbortController();
    try {
      const accepted = f.runtime.prepareNativeOrchestratorStep!(
        'parent',
        ['child'],
        controller.signal,
      );
      await f.started.promise;
      controller.abort();
      expect(await accepted).toBe(false);
    } finally {
      f.prepared.resolve();
      f.finished.resolve();
      await f.runtime.whenIdle();
      await f.runtime.close();
    }
  });

  it('joins a racing Human turn instead of deadlocking behind it or replaying the report', async () => {
    const f = fixture();
    try {
      const dm = f.runtime.admitDmMessage({
        channelId: f.dm.id,
        messageId: 'human-racing',
        body: 'New request',
      });
      if (!dm.admitted) throw new Error(dm.reason);
      const accepted = f.runtime.prepareNativeOrchestratorStep!(
        'parent',
        ['child'],
        new AbortController().signal,
      );
      await f.started.promise;
      f.prepared.resolve();
      expect(await accepted).toBe(true);
      f.finished.resolve();
      await dm.settled;
      await f.runtime.whenIdle();
      expect(f.runs).toHaveLength(1);
    } finally {
      f.prepared.resolve();
      f.finished.resolve();
      await f.runtime.close();
    }
  });
});
