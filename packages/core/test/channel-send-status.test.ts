import { describe, expect, it } from 'vitest';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { inboxFixture } from './inbox-fixture.js';
import { createSessionOwnership } from '../src/sessions/ownership.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

describe('Human DM send receipt', () => {
  it('projects explicit request resolution, never idle or a handled turn, as completion', async () => {
    const f = await inboxFixture();
    try {
      const first = await f.send('A private request body');
      const status = () => f.core.channels.humanSendStatus?.(f.dm.id, 'human-1');
      expect(status()).toMatchObject({
        sourceEventId: first,
        state: 'handled',
        progress: { state: 'working', terminal: false },
      });
      await f.send('Resolve the first request', (run) =>
        run.triage!.resolve({ ids: [first], outcome: 'done' }),
      );
      expect(status()).toMatchObject({
        progress: { state: 'completed', terminal: true, updatedAt: expect.any(String) },
      });
      expect(status()?.progress).not.toHaveProperty('resolutionNote');
      expect(f.core.channels.humanSendStatus?.(f.dm.id, 'human-2')).toMatchObject({
        progress: { state: 'working', terminal: false },
      });
    } finally {
      await f.close();
    }
  }, 60000);

  it('keeps failed attempts nonterminal and follows a safe retry through explicit resolution', async () => {
    const f = await inboxFixture();
    try {
      await f.core.channels.appendMessage(f.dm.id, {
        id: 'human-1',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'Retry this request',
      });
      await expect(
        f.send('Retry this request', () => {
          throw new Error('transport');
        }),
      ).rejects.toThrow('transport');
      const before = f.core.channels.humanSendStatus?.(f.dm.id, 'human-1');
      expect(before).toMatchObject({
        state: 'retryable',
        progress: { state: 'unknown', terminal: false },
      });
      await f.core.runtime.retryDmMessage?.(f.dm.id, 'human-1');
      await f.core.runtime.whenIdle();
      expect(f.core.channels.humanSendStatus?.(f.dm.id, 'human-1')).toMatchObject({
        sourceEventId: before!.sourceEventId,
        progress: { state: 'working', terminal: false },
      });
      await f.send('Resolve it', (run) =>
        run.triage!.resolve({ ids: [before!.sourceEventId], outcome: 'done' }),
      );
      expect(f.core.channels.humanSendStatus?.(f.dm.id, 'human-1')).toMatchObject({
        progress: { state: 'completed', terminal: true },
      });
    } finally {
      await f.close();
    }
  }, 60000);

  it('does not close a request needing side-effect reconciliation', async () => {
    const f = await inboxFixture();
    try {
      await f.core.channels.appendMessage(f.dm.id, {
        id: 'human-1',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'Check this request',
      });
      await expect(
        f.send('Check this request', async (run) => {
          await run.channels.send({ body: 'Started' });
          throw new Error('transport after effect');
        }),
      ).rejects.toThrow('transport after effect');
      expect(f.core.channels.humanSendStatus?.(f.dm.id, 'human-1')).toMatchObject({
        state: 'needs-repair',
        progress: { state: 'unknown', terminal: false },
      });
      await expect(f.core.runtime.retryDmMessage?.(f.dm.id, 'human-1')).rejects.toThrow(
        'cannot be safely retried',
      );
    } finally {
      await f.close();
    }
  }, 60000);

  it('returns only committed replies with the exact request and owned Session, including reopen', async () => {
    const home = createTempRoot();
    const owner = trackTestOwner(
      mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    const database = attachOperationalModule(owner, 'channel');
    const ownership = createSessionOwnership(attachOperationalModule(owner, 'session-ownership'));
    ownership.claim({
      sessionId: 'owned',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      at: '2026-10-10T00:00:00Z',
    });
    const store = createSqliteChannelStore({ rootDir: home, database, databaseOwnerReady: true });
    store.getOrCreateDm('ada', 'Ada');
    const human = (id: string) => ({
      id,
      at: '2026-10-10T00:00:00Z',
      author: { kind: 'human' as const },
      body: id,
    });
    await store.appendMessage('dm-ada', human('first'));
    await store.appendMessage('dm-ada', human('second'));
    const first = store.humanSendStatus?.('dm-ada', 'first');
    const second = store.humanSendStatus?.('dm-ada', 'second');
    if (!first || !second) throw new Error('Missing admitted Human request');
    expect(first?.sourceEventId).toEqual(expect.any(String));
    const bot = (id: string) => ({
      id,
      at: '2026-10-10T00:00:01Z',
      author: { kind: 'bot' as const, slug: 'ada' },
      body: id,
    });
    await store.appendMessage('dm-ada', bot('unattributed'));
    await store.appendMessage('dm-ada', bot('other-request'), {
      sessionId: 'owned',
      sourceEventId: second.sourceEventId,
    });
    await store.appendMessage('dm-ada', bot('unowned'), {
      sessionId: 'unknown',
      sourceEventId: first.sourceEventId,
    });
    await store.appendMessage('dm-ada', bot('matched'), {
      sessionId: 'owned',
      sourceEventId: first.sourceEventId,
    });
    await store.appendMessage(
      'dm-ada',
      {
        ...bot('question-card'),
        userQuestionRequest: {
          sessionId: 'owned',
          questions: [{ id: 'qa', question: 'Pick?', options: [{ label: 'Blue' }] }],
        },
      },
      { sessionId: 'owned', sourceEventId: first.sourceEventId },
    );
    expect(store.humanSendStatus?.('dm-ada', 'first')?.replies.map((reply) => reply.id)).toEqual([
      'matched',
    ]);
    expect(store.humanSendStatus?.('dm-ada', 'second')?.replies.map((reply) => reply.id)).toEqual([
      'other-request',
    ]);
    expect(store.humanSendStatus?.('dm-ada', 'matched')).toBeUndefined();
    expect(store.humanSendStatus?.('missing', 'first')).toBeUndefined();
    owner.close();
    const reopenedOwner = trackTestOwner(
      mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    const reopened = createSqliteChannelStore({
      rootDir: home,
      database: attachOperationalModule(reopenedOwner, 'channel'),
      databaseOwnerReady: true,
    });
    expect(reopened.humanSendStatus?.('dm-ada', 'first')?.replies.map((reply) => reply.id)).toEqual(
      ['matched'],
    );
  });
});
