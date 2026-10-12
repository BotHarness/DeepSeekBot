import { join } from 'node:path';

import { expect, it } from 'vitest';

import { createChannelStore } from '../src/channels/store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createBotRuntime, type BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';
import { createTestWorkspaceGrants } from './workspace-grant-fixture.js';

const idleAgents: BotAgentAdapter = {
  async runOrchestrator() {},
  async runAssignment() {},
  requestAssignment() {
    return { delivery: 'followup', accepted: Promise.resolve(), done: Promise.resolve() };
  },
  async close() {},
};

it('lists only the Assignments a Channel started, newest first', async () => {
  const home = createTempRoot('botharness-channel-assignments-');
  const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
  const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
  const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  attachOperationalModule(owner, 'channel-assignments-fixture').transaction((db) => {
    const add = (
      session: string,
      bot: string,
      channel: string,
      purpose: string,
      activity: string,
      updatedAt: string,
      report?: { state: string; summary: string },
      stop = 'running',
    ) => {
      db.prepare(
        `INSERT INTO session_ownership (session_id, bot_slug, root_role, created_at)
         VALUES (?, ?, 'assignment', ?)`,
      ).run(session, bot, updatedAt);
      db.prepare(
        `INSERT INTO source_events (source_event_id, source_kind, bot_slug, channel_id, message_id,
           body, created_at, attempt_state)
         VALUES (?, 'human-message', ?, ?, ?, 'ask', ?, 'handled')`,
      ).run('source-' + session, bot, channel, 'message-' + session, updatedAt);
      db.prepare(
        `INSERT INTO assignments (session_id, source_event_id, bot_slug, purpose, activity,
           stop_state, latest_report_state, latest_report_summary, latest_report_at,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        session,
        'source-' + session,
        bot,
        purpose,
        activity,
        stop,
        report?.state ?? null,
        report?.summary ?? null,
        report === undefined ? null : updatedAt,
        updatedAt,
        updatedAt,
      );
    };
    add('a-old', 'ada', 'group-team', 'Draft notes', 'idle', '2026-10-01T00:00:00.000Z', {
      state: 'completed',
      summary: 'Notes drafted',
    });
    add('b-new', 'bob', 'group-team', 'Check build', 'idle', '2026-10-02T00:00:00.000Z', {
      state: 'waiting-human',
      summary: 'Which branch?',
    });
    add('c-other', 'ada', 'group-other', 'Elsewhere', 'working', '2026-10-03T00:00:00.000Z');
    add(
      'd-stopped',
      'ada',
      'group-team',
      'Cancelled',
      'idle',
      '2026-09-30T00:00:00.000Z',
      undefined,
      'stopped',
    );
  });
  const runtime = createBotRuntime({
    database: owner,
    grants: createTestWorkspaceGrants(owner, home),
    registry,
    channels,
    agents: idleAgents,
    now: FIXED_NOW,
  });
  try {
    expect(runtime.listChannelAssignments?.('group-team')).toEqual([
      {
        sessionId: 'b-new',
        botSlug: 'bob',
        purpose: 'Check build',
        activity: 'idle',
        latestReport: {
          state: 'waiting-human',
          summary: 'Which branch?',
          at: '2026-10-02T00:00:00.000Z',
        },
        createdAt: '2026-10-02T00:00:00.000Z',
        updatedAt: '2026-10-02T00:00:00.000Z',
      },
      {
        sessionId: 'a-old',
        botSlug: 'ada',
        purpose: 'Draft notes',
        activity: 'idle',
        latestReport: {
          state: 'completed',
          summary: 'Notes drafted',
          at: '2026-10-01T00:00:00.000Z',
        },
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
      {
        sessionId: 'd-stopped',
        botSlug: 'ada',
        purpose: 'Cancelled',
        activity: 'stopped',
        createdAt: '2026-09-30T00:00:00.000Z',
        updatedAt: '2026-09-30T00:00:00.000Z',
      },
    ]);
    expect(runtime.listChannelAssignments?.('group-missing')).toEqual([]);
  } finally {
    await runtime.close();
    owner.close();
  }
});
