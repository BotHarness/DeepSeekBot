import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createChannelStore } from '../src/channels/store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createSessionOwnership } from '../src/sessions/ownership.js';
import {
  createBotRuntime,
  type BotRuntime,
  type BotAgentAdapter,
} from '../src/runtime/bot-runtime.js';
import { createTestRegistry } from './registry-fixture.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

function gate() {
  let release!: () => void;
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { done, release };
}

async function fixture(
  beforeNative?: (run: Parameters<BotAgentAdapter['runOrchestrator']>[0]) => void,
) {
  const home = createTempRoot('bh-native-question-runtime-');
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const registry = createTestRegistry({ database: owner, rootDir: join(home, 'bots') });
  registry.create({ slug: 'ada', displayName: 'Ada' });
  const channels = createChannelStore({ rootDir: join(home, 'channels') });
  const dm = channels.getOrCreateDm('ada', 'Ada')!;
  const first = gate();
  const ready = gate();
  const native = gate();
  const sessions: string[] = [];
  let bound: ReturnType<NonNullable<BotRuntime['bindNativeQuestionInput']>>;
  let runtime!: BotRuntime;
  const agents: BotAgentAdapter = {
    async runOrchestrator(run) {
      sessions.push(run.sessionId);
      if (run.acceptNativeInput !== undefined) {
        expect(run.message).toBe('');
        expect(runtime.canRequestPrivateInput?.(run.sessionId)).toBe(true);
        beforeNative?.(run);
        if (!run.acceptNativeInput()) return;
        await native.done;
        await run.channels.send({ body: 'Actual native answer reply' });
      } else {
        expect(runtime.canRequestPrivateInput?.(run.sessionId)).toBe(true);
        expect(runtime.canRequestPrivateInput?.('unowned')).toBe(false);
        bound = runtime.bindNativeQuestionInput?.(run.sessionId, dm.id);
        expect(runtime.bindNativeQuestionInput?.(run.sessionId, 'dm-other')).toBeUndefined();
        ready.release();
        await first.done;
      }
    },
    async runAssignment() {
      throw new Error('No second executor');
    },
    requestAssignment() {
      throw new Error('No Assignment');
    },
    async close() {},
  };
  const ownership = createSessionOwnership(attachOperationalModule(owner, 'session-ownership'));
  runtime = createBotRuntime({ database: owner, registry, channels, agents, ownership });
  const admission = runtime.admitDmMessage({
    channelId: dm.id,
    messageId: 'human-question-origin',
    body: 'Ask one formal question',
  });
  if (!admission.admitted) throw new Error(admission.reason);
  await ready.done;
  return {
    runtime,
    owner,
    channels,
    dm,
    ownership,
    first,
    native,
    admission,
    sessions,
    getBound: () => bound!,
  };
}

describe('native question answer uses the owning Orchestrator runtime', () => {
  it('serializes behind ordinary work, acknowledges native acceptance, and keeps authority through completion', async () => {
    const state = await fixture();
    const deliver = vi.fn(() => true);
    const accepted = state.getBound()(deliver);
    await Promise.resolve();
    expect(deliver).not.toHaveBeenCalled();
    state.first.release();
    await state.admission.settled;
    expect(await accepted).toBe(true);
    expect(state.sessions).toHaveLength(2);
    expect(new Set(state.sessions).size).toBe(1);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(state.channels.readMessages(state.dm.id)).toHaveLength(0);
    state.native.release();
    await state.runtime.whenIdle();
    expect(state.runtime.canRequestPrivateInput?.(state.sessions[0]!)).toBe(false);
    expect(state.channels.readMessages(state.dm.id)[0]?.body).toBe('Actual native answer reply');
    const events = attachOperationalModule(state.owner, 'native-question-test').read((db) =>
      db.prepare('SELECT COUNT(*) AS count FROM source_events').get(),
    );
    expect(events?.count).toBe(1);
    expect(
      state.runtime.bindNativeQuestionInput?.(state.sessions[0]!, state.dm.id),
    ).toBeUndefined();
    await state.runtime.close();
  });

  it('refuses a revoked Session before admitting any native answer', async () => {
    const state = await fixture();
    state.first.release();
    await state.admission.settled;
    state.ownership.markContentUnavailable();
    const deliver = vi.fn(() => true);
    expect(await state.getBound()(deliver)).toBe(false);
    expect(deliver).not.toHaveBeenCalled();
    expect(state.sessions).toHaveLength(1);
    await state.runtime.close();
  });

  it('rechecks authority after preparing the application run and before native delivery', async () => {
    const state = await fixture(() => state.ownership.markContentUnavailable());
    state.first.release();
    await state.admission.settled;
    const deliver = vi.fn(() => true);
    expect(await state.getBound()(deliver)).toBe(false);
    expect(deliver).not.toHaveBeenCalled();
    expect(state.sessions).toHaveLength(2);
    await state.runtime.whenIdle();
    await state.runtime.close();
  });
});
