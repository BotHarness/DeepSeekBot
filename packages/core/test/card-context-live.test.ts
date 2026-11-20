import { Context } from '@deepseek-ai/cordis';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { mountCardContextLive } from '../src/channels/card-context-live.js';
import { CHANNEL_STREAM_PATH } from '../src/channels/live.js';
import type { ChannelUserQuestions } from '../src/channels/user-questions.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { createCore } from '../src/plugin.js';
import type { AssignmentExecutionWait } from '../src/runtime/assignment-approval-capacity.js';
import type { ChannelToolApproval, ToolApprovalNotice } from '../src/workspaces/tool-approval.js';
import { createTempRoot } from './helpers.js';

const member = humanContext('member');
const outsider = humanContext('outsider');
const slug = 'member-bot';
const disposers: Array<() => unknown> = [];

afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose();
});

function fixture() {
  const core = createCore({ dshHome: createTempRoot('bh-card-context-live-') });
  disposers.push(async () => {
    core.live.close();
    core.schedules.close();
    core.externalMessaging.close();
    await core.tob.close();
    await core.runtime.close();
    core.contentPurge.close();
    core.operationalDatabase.close();
  });
  const database = attachOperationalModule(core.operationalDatabase, 'card-context-live-test');
  database.transaction((db) => {
    db.prepare('UPDATE team_settings SET enabled = 1').run();
    db.prepare("INSERT INTO humans VALUES (?, ?, 'active', '2026-11-20')").run(
      member.humanId,
      'Member',
    );
    db.prepare("INSERT INTO human_roles VALUES (?, 'member')").run(member.humanId);
  });
  core.team.spaces.ensureAccount(member.humanId);
  expect(core.registry.create({ slug, ownerHumanId: member.humanId, displayName: slug }).ok).toBe(
    true,
  );
  const dm = core.channels.getOrCreateDm(member, slug, slug);
  if (!dm) throw new Error('Expected a member Bot DM');
  database.transaction((db) =>
    db
      .prepare(
        "UPDATE channel_records SET record_json = json_set(record_json, '$.dmHumanId', ?) WHERE channel_id = ?",
      )
      .run(member.humanId, dm.id),
  );
  expect(core.channels.get(dm.id)?.dmHumanId).toBe(member.humanId);
  const methods = createBridgeMethodsForHumans(core);
  const ctx = new Context();
  let approvalChanged: Parameters<ChannelToolApproval['subscribe']>[0] | undefined;
  const approvals = {
    status: () => 'expired' as const,
    expiresAt: () => undefined,
    subscribe(listener: Parameters<ChannelToolApproval['subscribe']>[0]) {
      approvalChanged = listener;
      return () => {
        approvalChanged = undefined;
      };
    },
  };
  const questions: Pick<ChannelUserQuestions, 'subscribeStatus'> = {
    subscribeStatus: () => () => {},
  };
  return {
    core,
    dm,
    methods,
    mount(route: (slug: string) => unknown) {
      disposers.push(mountCardContextLive(ctx, core, approvals, questions, route));
    },
    notify(notice: ToolApprovalNotice) {
      approvalChanged?.(notice, 'allowed-once');
    },
    commit(topic: string) {
      database.transaction(() => undefined, [topic]);
    },
    async roster(human: typeof member) {
      const request = new Request('http://localhost' + CHANNEL_STREAM_PATH + '?scope=roster');
      const reader = core.live.open(human, request).body?.getReader();
      if (!reader) throw new Error('Expected a roster stream');
      disposers.push(() => reader.cancel());
      const until = async (marker: string) => {
        const decoder = new TextDecoder();
        let received = '';
        while (!received.includes(marker)) {
          const next = await reader.read();
          if (next.done) throw new Error('Roster stream closed before ' + marker);
          received += decoder.decode(next.value);
        }
        return received;
      };
      await until('retry:');
      return () => until('roster/changed');
    },
    async flush() {
      await Promise.resolve();
      core.live.publishRosterCommitted();
    },
  };
}

describe('card and composer live changes', () => {
  it('invalidates a member DM assignment approval on execution changes for the member only', async () => {
    const f = fixture();
    const request = {
      role: 'assignment',
      sessionId: 'assignment',
      callId: 'call',
      toolName: 'write',
      cwd: '/qa',
      input: '{}',
    } satisfies Omit<ToolApprovalNotice, 'botSlug' | 'channelId' | 'messageId' | 'expiresAt'>;
    const notice: ToolApprovalNotice = {
      ...request,
      botSlug: slug,
      channelId: f.dm.id,
      messageId: 'request',
      expiresAt: '2026-11-20T00:00:00Z',
    };
    expect(
      await f.core.channels.appendMessage(member, f.dm.id, {
        id: notice.messageId,
        at: '2026-11-20T00:00:00Z',
        author: { kind: 'bot', slug },
        body: 'Approve file write',
        toolApprovalRequest: request,
      }),
    ).toMatchObject({ id: notice.messageId });
    let wait: AssignmentExecutionWait | undefined = 'waiting-capacity';
    const getAssignment = vi.spyOn(f.core.runtime, 'getAssignment').mockImplementation(() => ({
      botSlug: slug,
      sourceEventId: 'source',
      sessionId: request.sessionId,
      title: 'Assignment',
      description: '',
      activity: 'working',
      createdAt: '2026-11-20T00:00:00Z',
      updatedAt: '2026-11-20T00:00:00Z',
    }));
    vi.spyOn(f.core.runtime, 'assignmentApprovalWait').mockImplementation(() => wait);
    expect(f.methods(owner).toolApprovalStatus(notice)).toMatchObject({
      ok: false,
      error: { code: 'channel-not-found' },
    });
    expect(f.methods(member).toolApprovalStatus(notice)).toMatchObject({
      ok: true,
      value: { execution: 'waiting-capacity' },
    });
    f.mount(() => undefined);
    const memberBatch = await f.roster(member);
    const outsiderBatch = await f.roster(outsider);
    const ownerBatch = await f.roster(owner);
    const event = '"resource":"tool-approval","channelId":"' + f.dm.id + '","messageId":"request"';

    const readBatch = async () => {
      await f.flush();
      const [visible, denied, ownerView] = await Promise.all([
        memberBatch(),
        outsiderBatch(),
        ownerBatch(),
      ]);
      expect(denied).not.toContain('resource/changed');
      expect(ownerView).not.toContain('resource/changed');
      return visible;
    };

    f.notify(notice);
    expect(await readBatch()).toContain(event);

    getAssignment.mockImplementationOnce(() => {
      throw new Error('Snapshot unavailable');
    });
    wait = undefined;
    f.commit('assignments');
    expect(await readBatch()).not.toContain('resource/changed');

    f.commit('assignments');
    expect(await readBatch()).toContain(event);
    expect(f.methods(member).toolApprovalStatus(notice)).toMatchObject({
      ok: true,
      value: { execution: 'running' },
    });

    f.commit('assignments');
    expect(await readBatch()).not.toContain('resource/changed');
  });

  it('publishes a composer context after a failed boot read while keeping successful boot reads quiet', async () => {
    const f = fixture();
    const quietSlug = 'second-bot';
    expect(
      f.core.registry.create({
        slug: quietSlug,
        ownerHumanId: member.humanId,
        displayName: quietSlug,
      }).ok,
    ).toBe(true);
    let ready = false;
    const memberBatch = await f.roster(member);
    f.mount((bot) => {
      if (bot === slug && !ready) throw new Error('Model route unavailable');
      return ['provider', 'model'];
    });

    await f.flush();
    expect(await memberBatch()).not.toContain('resource/changed');
    ready = true;
    f.commit('bot-registry');
    await f.flush();
    const recovered = await memberBatch();
    expect(recovered).toContain('"resource":"bot-context","slug":"member-bot"');
    expect(recovered).not.toContain('"slug":"second-bot"');

    f.commit('bot-registry');
    await f.flush();
    expect(await memberBatch()).not.toContain('resource/changed');
  });
});
