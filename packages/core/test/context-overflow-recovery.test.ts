import { Context } from '@deepseek-ai/cordis';
import CompactionEngine from '@deepseek-ai/dsh-compaction';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session';
import { expect, it, onTestFinished } from 'vitest';
import {
  createContextOverflowRecovery,
  type ContextOverflowRequest,
} from '../src/runtime/context-overflow-recovery.js';

const OVERFLOW =
  '400: {"type":"invalid_request_error","message":"Input too long: model limit 1048576 tokens, requested 1123530 tokens"}';

class TestCompaction extends CompactionEngine {
  calls = 0;
  action = async () => {};
  async compactIfNeeded() {
    this.calls++;
    await this.action();
    return null;
  }
  async compactRegion(): Promise<never> {
    throw new Error('not used');
  }
  async compactNow(): Promise<never> {
    throw new Error('not used');
  }
}

function fixture(owned = true, available = true) {
  const ctx = new Context();
  onTestFinished(() => ctx.fiber.dispose());
  const engine = available ? new TestCompaction(ctx) : undefined;
  const sessions = new SessionStore(ctx);
  const session = sessions.create(SessionId('overflow-test'));
  let flush = async () => {};
  const disposeFlush = ctx.on('session/flush', () => flush());
  const old = session.append(
    'user/message',
    createUserMessage({
      content: [{ type: 'text', text: 'Earlier context' }],
      source: { kind: 'user' },
    }),
    { surfaceOp: 'append' },
  );
  session.append(
    'user/message',
    createUserMessage({
      content: [{ type: 'text', text: 'Current request' }],
      source: { kind: 'user' },
    }),
    { surfaceOp: 'append' },
  );
  const progress = () =>
    session.append(
      'user/message',
      createUserMessage({
        content: [{ type: 'text', text: 'Summary' }],
        source: { kind: 'user' },
      }),
      {
        surfaceOp: { op: 'replace', startSeq: old.seq, endSeq: old.seq },
        sourceEventSeqs: [old.seq],
      },
    );
  if (engine)
    engine.action = async () => {
      progress();
    };
  const logs: Array<Record<string, unknown>> = [];
  const handle = createContextOverflowRecovery({
    isBotSession: () => owned,
    log: (event) => logs.push(event),
  });
  const request: ContextOverflowRequest = {
    agent: { ctx, session, options: {} },
    turn: 1,
    step: 1,
    provider: 'opencode-go',
    failure: { code: 'INVALID_REQUEST', message: OVERFLOW },
    signal: new AbortController().signal,
  };
  let delegated = 0;
  const next = async () => {
    delegated++;
    return undefined;
  };
  return {
    handle,
    request,
    next,
    engine,
    logs,
    progress,
    delegated: () => delegated,
    disposeFlush,
    setFlush: (action: () => Promise<void>) => {
      flush = action;
    },
  };
}

it('waits for the persistence checkpoint before returning a retry', async () => {
  const f = fixture();
  let release = () => {};
  const checkpoint = new Promise<void>((done) => {
    release = done;
  });
  let reached = () => {};
  const entered = new Promise<void>((done) => {
    reached = done;
  });
  f.setFlush(async () => {
    reached();
    await checkpoint;
  });
  let settled = false;
  const recovery = f.handle(f.request, f.next).finally(() => {
    settled = true;
  });
  await Promise.race([entered, recovery]);
  expect(settled).toBe(false);
  release();
  expect(await recovery).toEqual({ kind: 'retry' });
});

it('refuses retry after replacement when persistence fails or has no owner', async () => {
  for (const failed of [true, false]) {
    const f = fixture();
    if (failed)
      f.setFlush(async () => {
        throw new Error('private disk failure');
      });
    else f.disposeFlush();
    expect(await f.handle(f.request, f.next)).toBeUndefined();
    expect(f.request.agent.session.surface.replaceGeneration).toBe(1);
    expect(JSON.stringify(f.logs)).not.toContain('private disk failure');
  }
});

it('does not retry when cancellation arrives during the persistence checkpoint', async () => {
  const f = fixture();
  const controller = new AbortController();
  f.setFlush(async () => {
    controller.abort();
  });
  expect(await f.handle({ ...f.request, signal: controller.signal }, f.next)).toBeUndefined();
});

it('recovers a missed token-limit error only after native context progress', async () => {
  const f = fixture();
  const original = { ...f.request.failure };
  expect(await f.handle(f.request, f.next)).toEqual({ kind: 'retry' });
  expect(f.engine?.calls).toBe(1);
  expect(f.request.failure).toEqual(original);
  expect(f.request.agent.session.surface.replaceGeneration).toBe(1);
});

it('bounds recovery to one attempt in a step, with a fresh budget for a later turn', async () => {
  const f = fixture();
  expect(await f.handle(f.request, f.next)).toEqual({ kind: 'retry' });
  expect(await f.handle(f.request, f.next)).toBeUndefined();
  expect(f.engine?.calls).toBe(1);
  if (f.engine)
    f.engine.action = async () => {
      throw new Error('no progress');
    };
  expect(await f.handle({ ...f.request, turn: 2 }, f.next)).toBeUndefined();
  expect(f.engine?.calls).toBe(2);
});

it.each([
  ['INVALID_REQUEST', 'Input too long'],
  ['INVALID_REQUEST', 'Input too long: model limit 100 characters, requested 120 characters'],
  ['AUTH', OVERFLOW],
  ['CONTEXT_WINDOW_EXCEEDED', OVERFLOW],
])('leaves %s / %s to the existing handlers', async (code, message) => {
  const f = fixture();
  expect(await f.handle({ ...f.request, failure: { code, message } }, f.next)).toBeUndefined();
  expect(f.engine?.calls).toBe(0);
  expect(f.delegated()).toBe(1);
});

it('does not recover unowned sessions, unavailable services or cancelled turns', async () => {
  for (const { f, cancel } of [
    { f: fixture(false), cancel: false },
    { f: fixture(true, false), cancel: false },
    { f: fixture(), cancel: true },
  ]) {
    const controller = new AbortController();
    if (cancel) controller.abort();
    expect(await f.handle({ ...f.request, signal: controller.signal }, f.next)).toBeUndefined();
    expect(f.engine?.calls ?? 0).toBe(0);
  }
});

it('preserves failures and refuses a retry when compaction makes no durable progress', async () => {
  const f = fixture();
  if (f.engine) f.engine.action = async () => {};
  expect(await f.handle(f.request, f.next)).toBeUndefined();
  expect(f.engine?.calls).toBe(1);
  if (f.engine)
    f.engine.action = async () => {
      throw new Error('private provider detail');
    };
  expect(await f.handle({ ...f.request, turn: 2 }, f.next)).toBeUndefined();
  expect(JSON.stringify(f.logs)).not.toContain('private provider detail');
});

it('preserves an existing recovery decision without compacting twice', async () => {
  const f = fixture();
  expect(await f.handle(f.request, async () => ({ kind: 'retry' }))).toEqual({ kind: 'retry' });
  expect(f.engine?.calls).toBe(0);
});

it('accepts committed progress after a summary error, but never retries a cancelled turn', async () => {
  const f = fixture();
  if (f.engine)
    f.engine.action = async () => {
      f.progress();
      throw new Error('private detail');
    };
  expect(await f.handle(f.request, f.next)).toEqual({ kind: 'retry' });
  const cancelled = fixture();
  const controller = new AbortController();
  if (cancelled.engine)
    cancelled.engine.action = async () => {
      cancelled.progress();
      controller.abort();
    };
  expect(
    await cancelled.handle({ ...cancelled.request, signal: controller.signal }, cancelled.next),
  ).toBeUndefined();
});
