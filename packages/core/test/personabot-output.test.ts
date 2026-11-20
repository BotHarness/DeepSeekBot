import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { Context } from '@deepseek-ai/cordis';
import { describe, expect, it, vi } from 'vitest';
import { createCore } from '../src/plugin.js';
import {
  emitPersonaBotOutputCommitted,
  PERSONABOT_OUTPUT_COMMITTED,
  personaBotOutputCommitted,
  type PersonaBotOutputCommitted,
} from '../src/channels/output.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';
import type { ChannelMessageCommit } from '../src/channels/store.js';

const origin = { sessionId: 'orchestrator-ada', sourceEventId: 'source-human' };
function commit(): ChannelMessageCommit {
  return {
    channelId: 'dm-ada',
    revision: 1,
    origin,
    message: {
      id: 'public-message',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'bot', slug: 'ada' },
      body: 'Public reply',
      replyTo: 'human-message',
      botCausation: { rootSourceEventId: 'root', parentSourceEventId: 'parent', hop: 2 },
    },
  };
}
function event(): PersonaBotOutputCommitted {
  const result = personaBotOutputCommitted(commit(), {
    resolve: () => ({
      sessionId: origin.sessionId,
      botSlug: 'ada',
      rootRole: 'orchestrator',
      provenance: 'created',
      parentSessionId: undefined,
      cwdReference: undefined,
      createdAt: FIXED_NOW().toISOString(),
    }),
  });
  if (result === undefined) throw new Error('Missing output');
  return result;
}

async function close(core: ReturnType<typeof createCore>) {
  await core.runtime.close();
  core.externalMessaging.close();
  core.live.close();
  core.operationalDatabase.close();
}

describe('PersonaBot Output Committed', () => {
  it('projects an immutable allowlist instead of leaking Channel or Session payloads', () => {
    const candidate = commit();
    Object.assign(candidate.message, {
      toolApprovalRequest: { input: 'PRIVATE-TOOL-ARGS' },
      replyToPreview: { body: 'PRIVATE-QUOTED-CONTENT' },
      attachments: [{ storagePath: 'PRIVATE-STORAGE-PATH' }],
      reasoning: 'PRIVATE-REASONING',
      credentials: 'PRIVATE-CREDENTIAL',
      prompt: 'PRIVATE-PROMPT',
    });
    const result = personaBotOutputCommitted(candidate, {
      resolve: () => ({
        sessionId: origin.sessionId,
        botSlug: 'ada',
        rootRole: 'orchestrator',
        provenance: 'created',
        parentSessionId: undefined,
        cwdReference: undefined,
        createdAt: FIXED_NOW().toISOString(),
      }),
    });
    expect(result).toEqual({
      version: 1,
      botId: 'ada',
      sessionId: origin.sessionId,
      channelId: 'dm-ada',
      messageId: 'public-message',
      channelRevision: 1,
      at: FIXED_NOW().toISOString(),
      content: { body: 'Public reply', format: 'markdown' },
      correlation: {
        sourceEventId: 'source-human',
        replyToMessageId: 'human-message',
        rootSourceEventId: 'root',
        parentSourceEventId: 'parent',
      },
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.content)).toBe(true);
    expect(Object.isFrozen(result?.correlation)).toBe(true);
    expect(personaBotOutputCommitted(candidate, { resolve: () => undefined })).toBeUndefined();
    expect(
      personaBotOutputCommitted(
        {
          channelId: candidate.channelId,
          revision: candidate.revision,
          message: candidate.message,
        },
        { resolve: () => undefined },
      ),
    ).toBeUndefined();
    expect(
      personaBotOutputCommitted(
        { ...candidate, message: { ...candidate.message, author: { kind: 'human' } } },
        { resolve: () => undefined },
      ),
    ).toBeUndefined();
  });

  it('isolates synchronous/rejected/mutating listeners without awaiting a slow consumer', async () => {
    const ctx = new Context();
    const warn = vi.fn();
    const seen: PersonaBotOutputCommitted[] = [];
    ctx.on(PERSONABOT_OUTPUT_COMMITTED, () => {
      throw new Error('PRIVATE-FAILURE');
    });
    ctx.on(PERSONABOT_OUTPUT_COMMITTED, async () => {
      throw new Error('PRIVATE-ASYNC-FAILURE');
    });
    ctx.on(PERSONABOT_OUTPUT_COMMITTED, (output) => {
      Object.assign(output.content, { body: 'changed' });
    });
    let finish: (() => void) | undefined;
    ctx.on(
      PERSONABOT_OUTPUT_COMMITTED,
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    ctx.on(PERSONABOT_OUTPUT_COMMITTED, (output) => seen.push(output));
    try {
      emitPersonaBotOutputCommitted(ctx, event(), warn);
      expect(seen).toHaveLength(1);
      expect(seen[0]?.content.body).toBe('Public reply');
      await Promise.resolve();
      expect(warn).toHaveBeenCalledTimes(3);
      expect(warn.mock.calls.flat()).toEqual(Array(3).fill('personabot-output-consumer-failed'));
      finish?.();
    } finally {
      await ctx.fiber.dispose();
    }
  });

  it('uses the Cordis Consumer Fiber lifecycle and filters by Bot/Channel without replay', async () => {
    const ctx = new Context();
    const seen: string[] = [];
    const fiber = ctx.plugin({
      name: 'neutral-output-consumer',
      apply(consumer: Context) {
        consumer.on(PERSONABOT_OUTPUT_COMMITTED, (output) => {
          if (output.botId === 'ada' && output.channelId === 'dm-ada') seen.push(output.messageId);
        });
      },
    });
    await fiber.await();
    emitPersonaBotOutputCommitted(ctx, { ...event(), botId: 'other' }, () => undefined);
    emitPersonaBotOutputCommitted(ctx, event(), () => undefined);
    expect(seen).toEqual(['public-message']);
    await fiber.dispose();
    emitPersonaBotOutputCommitted(ctx, event(), () => undefined);
    expect(seen).toEqual(['public-message']);
    await ctx.fiber.dispose();
    expect(() => emitPersonaBotOutputCommitted(ctx, event(), () => undefined)).not.toThrow();
  });

  it('only notifies after a SQLite commit; retries, rollback and restart do not replay', async () => {
    const home = createTempRoot('botharness-output-');
    const seen: PersonaBotOutputCommitted[] = [];
    const core = createCore({
      dshHome: home,
      onOutputCommitted: (output) => {
        expect(core.channels.message(output.channelId, output.messageId)?.body).toBe(
          output.content.body,
        );
        seen.push(output);
      },
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.ownership.claim({
        sessionId: origin.sessionId,
        botSlug: 'ada',
        rootRole: 'orchestrator',
        at: FIXED_NOW().toISOString(),
      });
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
      if (dm === undefined) throw new Error('DM missing');
      const publicMessage = { ...commit().message };
      delete publicMessage.replyTo;
      expect(
        await core.channels.appendMessageOnce(
          OWNER_HUMAN_CONTEXT,
          dm.id,
          publicMessage,
          undefined,
          origin,
        ),
      ).toMatchObject({ status: 'appended' });
      expect(
        await core.channels.appendMessageOnce(
          OWNER_HUMAN_CONTEXT,
          dm.id,
          publicMessage,
          undefined,
          origin,
        ),
      ).toMatchObject({ status: 'existing' });
      expect(
        await core.channels.appendMessageOnce(
          OWNER_HUMAN_CONTEXT,
          dm.id,
          { ...publicMessage, body: 'different' },
          undefined,
          origin,
        ),
      ).toMatchObject({ status: 'conflict' });
      expect(seen).toHaveLength(1);
      const database = attachOperationalModule(core.operationalDatabase, 'output-contract-test');
      database.transaction(
        (db) => {
          db.exec(
            "CREATE TRIGGER reject_output BEFORE INSERT ON source_events WHEN NEW.message_id = 'rollback-message' BEGIN SELECT RAISE(ABORT, 'QA writer failure'); END;",
          );
        },
        ['test'],
      );
      await expect(
        core.channels.appendMessageOnce(
          OWNER_HUMAN_CONTEXT,
          dm.id,
          { ...publicMessage, id: 'rollback-message' },
          undefined,
          origin,
        ),
      ).rejects.toThrow();
      expect(core.channels.message(dm.id, 'rollback-message')).toBeUndefined();
      await expect(
        core.channels.appendMessage(
          OWNER_HUMAN_CONTEXT,
          dm.id,
          { ...publicMessage, id: 'missing-reply', replyTo: 'missing' },
          origin,
        ),
      ).rejects.toThrow();
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
        ...publicMessage,
        id: 'no-origin',
      });
      await core.channels.appendMessage(
        OWNER_HUMAN_CONTEXT,
        dm.id,
        { ...publicMessage, id: 'wrong-owner' },
        { sessionId: 'unknown' },
      );
      await core.channels.appendMessage(
        OWNER_HUMAN_CONTEXT,
        dm.id,
        { ...publicMessage, id: 'human', author: { kind: 'human' } },
        origin,
      );
      core.live.publishDraft({
        type: 'update',
        draft: {
          channelId: dm.id,
          draftId: 'draft',
          attemptId: 'attempt',
          botSlug: 'ada',
          body: 'Uncommitted delta',
        },
      });
      expect(seen).toHaveLength(1);
    } finally {
      await close(core);
    }
    const reopened = createCore({
      dshHome: home,
      onOutputCommitted: (output) => seen.push(output),
    });
    try {
      expect(reopened.channels.message('dm-ada', 'public-message')?.body).toBe('Public reply');
      expect(seen).toHaveLength(1);
      expect(
        reopened.channels.messagesAfter('dm-ada', 0)?.every((row) => row.origin === undefined),
      ).toBe(true);
    } finally {
      await close(reopened);
    }
  });

  it('keeps trusted origin out of live Channel SSE while preserving the canonical message', async () => {
    const core = createCore({ dshHome: createTempRoot('botharness-output-sse-') });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
      const response = core.live.open(
        OWNER_HUMAN_CONTEXT,
        new Request('http://localhost/api/botharness/stream?channelId=dm-ada&after=0'),
      );
      const reader = response.body?.getReader();
      if (reader === undefined) throw new Error('SSE reader missing');
      await reader.read();
      await reader.read();
      await core.channels.appendMessage(
        OWNER_HUMAN_CONTEXT,
        'dm-ada',
        {
          id: 'sse-public',
          at: FIXED_NOW().toISOString(),
          author: { kind: 'bot', slug: 'ada' },
          body: 'Public SSE reply',
        },
        { sessionId: 'PRIVATE-SESSION-ORIGIN', sourceEventId: 'PRIVATE-SOURCE-ORIGIN' },
      );
      const frame = new TextDecoder().decode((await reader.read()).value);
      expect(frame).toContain('Public SSE reply');
      expect(frame).not.toContain('PRIVATE');
      expect(frame).not.toContain('origin');
      await reader.cancel();
    } finally {
      await close(core);
    }
  });

  it('the real Runtime send seam carries Session and Source correlation for DM and Group', async () => {
    const seen: PersonaBotOutputCommitted[] = [];
    let groupId = '';
    const core = createCore({
      dshHome: createTempRoot('botharness-output-runtime-'),
      onOutputCommitted: (output) => seen.push(output),
      agents: {
        async runOrchestrator(run) {
          await run.channels.send({ body: 'DM response' });
          await run.channels.send({
            channelId: groupId,
            body: 'Group response',
            deliveryKey: 'output-once',
          });
          await run.channels.send({
            channelId: groupId,
            body: 'Group response',
            deliveryKey: 'output-once',
          });
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('No Assignment');
        },
        async close() {},
      },
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
      groupId = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Output QA',
        members: ['ada'],
      }).id;
      const human = await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, 'dm-ada', {
        id: 'human-source',
        at: FIXED_NOW().toISOString(),
        author: { kind: 'human' },
        body: 'Please reply',
      });
      if (human === undefined) throw new Error('Human message missing');
      const admission = core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: 'dm-ada',
        messageId: human.id,
        body: human.body,
      });
      if (!admission.admitted) throw new Error('Admission rejected');
      await admission.settled;
      expect(seen.map((output) => output.content.body)).toEqual(['DM response', 'Group response']);
      expect(
        seen.every((output) => core.ownership.resolve(output.sessionId)?.botSlug === 'ada'),
      ).toBe(true);
      expect(seen.every((output) => output.correlation.sourceEventId !== undefined)).toBe(true);
      expect(seen[1]?.correlation.parentSourceEventId).toBe(seen[0]?.correlation.sourceEventId);
    } finally {
      await close(core);
    }
  });
});
