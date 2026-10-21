import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createChannelStore } from '../src/channels/store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createBotRuntime, type OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTestRegistry } from './registry-fixture.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';
import { createTestWorkspaceGrants } from './workspace-grant-fixture.js';

async function fixture(action: (run: OrchestratorAgentRun) => Promise<void>) {
  const home = createTempRoot('botharness-final-host-');
  const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
  expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
  const dm = channels.getOrCreateDm('ada', 'Ada')!;
  const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  const warnings: string[] = [];
  const runtime = createBotRuntime({
    database: owner,
    grants: createTestWorkspaceGrants(owner, home),
    registry,
    channels,
    now: FIXED_NOW,
    warn: (message) => warnings.push(message),
    agents: {
      runOrchestrator: action,
      requestAssignment() {
        throw new Error('Assignments are outside this final-reply fixture');
      },
      async runAssignment() {},
      async close() {},
    },
  });
  return {
    runtime,
    channels,
    dm,
    warnings,
    async admit(messageId = 'human-one') {
      await channels.appendMessage(dm.id, {
        id: messageId,
        at: FIXED_NOW().toISOString(),
        author: { kind: 'human' },
        body: '请核查',
      });
      const accepted = runtime.admitDmMessage({ channelId: dm.id, messageId, body: '请核查' });
      expect(accepted.admitted).toBe(true);
      if (accepted.admitted) await accepted.settled;
      await runtime.whenIdle();
    },
    source() {
      return attachOperationalModule(owner, 'final-host-test').read((db) =>
        db
          .prepare(
            "SELECT a.source_event_id, a.resolved_at, a.resolution, a.final_reply_json FROM inbox_admissions a JOIN source_events e ON e.source_event_id = a.source_event_id WHERE a.bot_slug = 'ada' AND e.source_kind = 'human-message' ORDER BY e.created_at",
          )
          .all(),
      );
    },
    async close() {
      await runtime.close();
      owner.close();
    },
  };
}

const answer = { action: 'reply' as const, text: '核查结果', complete: true };

describe('Host-owned final delivery rather than model output alone', () => {
  it('commits the final without any tool and binds the original Human DM', async () => {
    const fx = await fixture(async (run) => {
      await run.replyFinal?.(answer);
    });
    try {
      await fx.admit();
      expect(
        fx.channels
          .readMessages(fx.dm.id)
          .filter((m) => m.author.kind === 'bot')
          .map((m) => m.body),
      ).toEqual(['核查结果']);
      expect(fx.source()).toEqual([
        expect.objectContaining({
          resolution: 'done',
          resolved_at: expect.any(String),
          final_reply_json: expect.stringContaining('"status":"accepted"'),
        }),
      ]);
    } finally {
      await fx.close();
    }
  });

  it('a normal read tool before the final is not a send attempt', async () => {
    const fx = await fixture(async (run) => {
      run.assignments.list();
      await run.replyFinal?.(answer);
    });
    try {
      await fx.admit();
      expect(
        fx.channels
          .readMessages(fx.dm.id)
          .filter((m) => m.author.kind === 'bot')
          .map((m) => m.body),
      ).toEqual(['核查结果']);
      expect(fx.source()).toEqual([
        expect.objectContaining({
          resolution: 'done',
          resolved_at: expect.any(String),
          final_reply_json: expect.stringContaining('"status":"accepted"'),
        }),
      ]);
    } finally {
      await fx.close();
    }
  });

  it('an explicit delivered reply followed by a tool does not also send the final', async () => {
    const fx = await fixture(async (run) => {
      await run.channels.send({ body: '显式结果' });
      run.assignments.list();
      await run.replyFinal?.(answer);
    });
    try {
      await fx.admit();
      expect(
        fx.channels
          .readMessages(fx.dm.id)
          .filter((m) => m.author.kind === 'bot')
          .map((m) => m.body),
      ).toEqual(['显式结果']);
      expect(fx.warnings.some((m) => m.includes('explicit-send-attempt'))).toBe(true);
    } finally {
      await fx.close();
    }
  });

  it('a rejected explicit send cannot trigger a blind final fallback', async () => {
    const fx = await fixture(async (run) => {
      await expect(
        run.channels.send({ channelId: 'not-authorized', body: '不应发送' }),
      ).rejects.toThrow();
      await run.replyFinal?.(answer);
    });
    try {
      await fx.admit();
      expect(fx.channels.readMessages(fx.dm.id).filter((m) => m.author.kind === 'bot')).toEqual([]);
      expect(fx.warnings.some((m) => m.includes('explicit-send-attempt'))).toBe(true);
      expect(fx.source()).toEqual([
        expect.objectContaining({
          resolved_at: null,
          final_reply_json: expect.stringContaining('"status":"refused"'),
        }),
      ]);
    } finally {
      await fx.close();
    }
  });

  it('a later read does not erase a committed final, and a second final is not duplicated', async () => {
    const fx = await fixture(async (run) => {
      await run.replyFinal?.(answer);
      run.assignments.list();
      await run.replyFinal?.(answer);
    });
    try {
      await fx.admit();
      expect(
        fx.channels
          .readMessages(fx.dm.id)
          .filter((m) => m.author.kind === 'bot')
          .map((m) => m.body),
      ).toEqual(['核查结果']);
      expect(fx.source()).toEqual([
        expect.objectContaining({
          resolution: 'done',
          resolved_at: expect.any(String),
          final_reply_json: expect.stringContaining('"status":"accepted"'),
        }),
      ]);
    } finally {
      await fx.close();
    }
  });

  it('silent output leaves no delivered message', async () => {
    const fx = await fixture(async (run) => {
      await run.replyFinal?.({ action: 'silent' });
    });
    try {
      await fx.admit();
      expect(fx.channels.readMessages(fx.dm.id).filter((m) => m.author.kind === 'bot')).toEqual([]);
    } finally {
      await fx.close();
    }
  });

  it('a retained callback after the source turn ends cannot send', async () => {
    let reply: OrchestratorAgentRun['replyFinal'];
    const fx = await fixture(async (run) => {
      reply = run.replyFinal;
    });
    try {
      await fx.admit();
      await reply?.(answer);
      expect(fx.channels.readMessages(fx.dm.id).filter((m) => m.author.kind === 'bot')).toEqual([]);
    } finally {
      await fx.close();
    }
  });
});
