import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type {
  AssignmentAgentRun,
  AssignmentRequestDelivery,
  BotAgentAdapter,
  OrchestratorAgentRun,
} from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const AT = '2026-10-10T00:00:00.000Z';

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
}

function adapter(onRun: (run: OrchestratorAgentRun) => Promise<void>): BotAgentAdapter {
  return {
    runOrchestrator: onRun,
    async runAssignment(_run: AssignmentAgentRun) {},
    requestAssignment(_run: AssignmentAgentRun): AssignmentRequestDelivery {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
}

type Core = ReturnType<typeof createCore>;

function commitLines(core: Core, channelId: string) {
  return core.channels
    .readMessages(channelId)
    .reverse()
    .filter((item) => item.memoryCommit !== undefined)
    .map((item) => item.memoryCommit!);
}

function commitRecords(core: Core) {
  return attachOperationalModule(core.operationalDatabase, 'memory-commit-test').read((db) =>
    db
      .prepare(`
        SELECT e.channel_id, a.bot_slug, a.reason, a.attempt_state
          FROM source_events e JOIN inbox_admissions a ON a.source_event_id = e.source_event_id
         WHERE json_type(e.payload_json, '$.memoryCommit') IS NOT NULL
         ORDER BY e.rowid
      `)
      .all(),
  );
}

function commit(root: string, file: string, body: string, message: string): void {
  writeFileSync(join(root, file), body);
  git(root, 'add', file);
  git(root, '-c', 'user.name=Mira', '-c', 'user.email=mira@example.com', 'commit', '-m', message);
}

describe('Memory commit Self-Records', () => {
  it('adds one line per commit made during a Group-caused turn, in that Group and the Bot DM', async () => {
    let groupId = '';
    let turns = 0;
    const core: Core = createCore({
      dshHome: createTempRoot('botharness-memory-commit-group-'),
      agents: adapter(async (run) => {
        turns += 1;
        if (run.inboundChannelId !== groupId) return;
        const root = core.registry.memoryDirFor('mira')!;
        commit(root, 'launch.md', 'Launch is Friday\n', 'Remember the launch date');
        commit(root, 'owners.md', 'Nova owns QA\nMira owns notes\n', 'Record launch owners');
        writeFileSync(join(root, 'draft.md'), 'not committed\n');
      }),
    });
    try {
      core.registry.create({ slug: 'mira', displayName: 'Mira' });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Crew',
        members: ['mira'],
      });
      groupId = group.id;
      core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'mira', 'Mira');
      const unreadBefore = core.humanAttention.status(OWNER_HUMAN_CONTEXT).unreadCount;
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, group.id, {
        id: 'ask',
        at: AT,
        author: { kind: 'human' },
        body: '@Mira 记一下发布日期',
        mentions: [{ botSlug: 'mira', label: 'Mira', start: 0, end: 5 }],
      });
      core.runtime.admitGroupMessage(group.id, 'ask');
      await core.runtime.whenIdle();

      const lines = commitLines(core, group.id);
      expect(lines.map((line) => line.subject)).toEqual([
        'Remember the launch date',
        'Record launch owners',
      ]);
      expect(lines[0]).toMatchObject({
        botSlug: 'mira',
        authorName: 'Mira',
        files: [{ path: 'launch.md', added: 1, deleted: 0 }],
        moreFiles: 0,
      });
      expect(lines[1]?.files).toEqual([{ path: 'owners.md', added: 2, deleted: 0 }]);
      expect(JSON.stringify(lines)).not.toContain('mira@example.com');
      expect(JSON.stringify(lines)).not.toContain('Launch is Friday');
      const dmLines = core.channels
        .readMessages('dm-mira')
        .reverse()
        .filter((item) => item.memoryCommit !== undefined);
      expect(dmLines.map((line) => line.memoryCommit!.sha)).toEqual(lines.map((line) => line.sha));
      expect(dmLines.every((line) => line.noticeOrigin?.channelId === group.id)).toBe(true);
      expect(core.channels.latestMessage('dm-mira')).toBeUndefined();
      expect(commitRecords(core)).toEqual([
        {
          channel_id: group.id,
          bot_slug: 'mira',
          reason: 'memory-commit',
          attempt_state: 'handled',
        },
        {
          channel_id: group.id,
          bot_slug: 'mira',
          reason: 'memory-commit',
          attempt_state: 'handled',
        },
      ]);
      expect(turns).toBe(1);
      expect(core.humanAttention.status(OWNER_HUMAN_CONTEXT).unreadCount).toBe(unreadBefore);
      expect(core.channels.latestMessage(group.id)?.id).toBe('ask');
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('keeps a DM-caused commit in that DM and never re-records history', async () => {
    let commitInTurn = true;
    const core: Core = createCore({
      dshHome: createTempRoot('botharness-memory-commit-dm-'),
      agents: adapter(async () => {
        if (!commitInTurn) return;
        commit(core.registry.memoryDirFor('mira')!, 'note.md', 'one\n', 'First note');
      }),
    });
    try {
      core.registry.create({ slug: 'mira', displayName: 'Mira' });
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'mira', 'Mira')!;
      const root = core.registry.memoryDirFor('mira')!;
      commit(root, 'old.md', 'before\n', 'Existing history');
      const ask = async (id: string): Promise<void> => {
        await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
          id,
          at: AT,
          author: { kind: 'human' },
          body: id,
        });
        core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
          channelId: dm.id,
          messageId: id,
          body: id,
        });
        await core.runtime.whenIdle();
      };
      await ask('one');
      commitInTurn = false;
      await ask('two');
      expect(commitLines(core, dm.id).map((line) => line.subject)).toEqual(['First note']);
      expect(commitRecords(core)).toHaveLength(1);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
