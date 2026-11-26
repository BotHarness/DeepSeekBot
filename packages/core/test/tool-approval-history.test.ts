import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { ChannelToolApproval } from '../src/workspaces/tool-approval.js';
import { createTempRoot } from './helpers.js';

const agents: BotAgentAdapter = {
  async runOrchestrator() {},
  async runAssignment() {},
  async close() {},
  requestAssignment() {
    throw new Error('No Assignment expected');
  },
};

import { attachOperationalModule } from '../src/database/owner.js';
import type { ToolAutoApproval } from '../src/workspaces/tool-approval.js';

describe('approval history and always-allow counts over the Host bridge', () => {
  it('lists Human answers newest first and counts each request a rule answers once', async () => {
    const core = createCore({ dshHome: createTempRoot('botharness-approval-history-'), agents });
    const broker = new ChannelToolApproval(core.channels, core.ownership, core.toolRules);
    const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, toolApproval: broker });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'grace', displayName: 'Grace' });
      const channel = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      core.ownership.claim({
        sessionId: 'qa-ada',
        botSlug: 'ada',
        rootRole: 'orchestrator',
        at: '2026-10-27T08:00:00Z',
      });
      const agent = { session: { id: 'qa-ada', header: { cwd: '/qa/history' } } } as Agent;
      const track = (callId: string, command: string) => {
        broker.track({
          agent,
          name: 'bash',
          callId,
          arguments: { command },
          token: Symbol(callId),
        } as ToolExecution);
        return broker.ask({ agent, toolName: 'bash', callId });
      };
      const card = async (callId: string) => {
        await vi.waitFor(() =>
          expect(
            core.channels
              .readMessages(channel.id)
              .some((m) => m.toolApprovalRequest?.callId === callId),
          ).toBe(true),
        );
        return core.channels
          .readMessages(channel.id)
          .find((m) => m.toolApprovalRequest?.callId === callId)!.id;
      };
      const tick = () => new Promise((done) => setTimeout(done, 5));

      const first = track('call-pwd', 'pwd');
      const firstCard = await card('call-pwd');
      await methods.toolApprovalDecide({
        channelId: channel.id,
        messageId: firstCard,
        outcome: 'rejected',
      });
      expect(await first).toBe('rejected');
      await tick();

      const second = track('call-ls', 'ls');
      const secondCard = await card('call-ls');
      await methods.toolApprovalDecide({
        channelId: channel.id,
        messageId: secondCard,
        outcome: 'allowed-always-exact',
      });
      expect(await second).toBe('allowed-once');
      const saved = methods.toolApprovalRules({ slug: 'ada' });
      expect(saved).toMatchObject({ ok: true, value: { rules: [{ autoApprovedCount: 0 }] } });

      expect(await track('call-ls-2', 'ls')).toBe('allowed-once');
      expect(await track('call-ls-3', 'ls')).toBe('allowed-once');
      const counted = methods.toolApprovalRules({ slug: 'ada' });
      expect(counted).toMatchObject({ ok: true, value: { rules: [{ autoApprovedCount: 2 }] } });

      const history = methods.toolApprovalHistory({ slug: 'ada' });
      expect(history).toMatchObject({
        ok: true,
        value: {
          entries: [
            {
              channelId: channel.id,
              requestMessageId: secondCard,
              toolName: 'bash',
              role: 'orchestrator',
              outcome: 'allowed-always-exact',
            },
            { requestMessageId: firstCard, outcome: 'rejected' },
          ],
        },
      });
      expect(history.ok && history.value.nextCursor).toBeFalsy();

      const page = methods.toolApprovalHistory({ slug: 'ada', limit: 1 });
      if (!page.ok) throw new Error('first page refused');
      expect(page.value.entries.map((entry) => entry.requestMessageId)).toEqual([secondCard]);
      expect(page.value.nextCursor).toBeDefined();
      const next = methods.toolApprovalHistory({
        slug: 'ada',
        limit: 1,
        cursor: page.value.nextCursor,
      });
      expect(next).toMatchObject({
        ok: true,
        value: { entries: [{ requestMessageId: firstCard }] },
      });
      expect(next.ok && next.value.nextCursor).toBeFalsy();

      expect(methods.toolApprovalHistory({ slug: 'grace' })).toEqual({
        ok: true,
        value: { entries: [] },
      });
      expect(methods.toolApprovalHistory({ slug: 'ada', cursor: 'nope' })).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
      expect(methods.toolApprovalHistory({ slug: 'ada', limit: 0 })).toMatchObject({
        ok: false,
      });
      expect(methods.toolApprovalHistory({ slug: 'nobody' })).toMatchObject({ ok: false });
    } finally {
      broker.close();
      await core.runtime.close();
      core.externalMessaging.close();
      core.live.close();
      core.operationalDatabase.close();
    }
  });
});

describe('Shell prefix approvals over the Host bridge', () => {
  function shellHost(auto?: ToolAutoApproval) {
    const core = createCore({ dshHome: createTempRoot('botharness-shell-prefix-'), agents });
    const broker = new ChannelToolApproval(
      core.channels,
      core.ownership,
      core.toolRules,
      undefined,
      undefined,
      undefined,
      undefined,
      auto,
    );
    const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, toolApproval: broker });
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const channel = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    core.ownership.claim({
      sessionId: 'qa-ada',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      at: '2026-11-26T08:00:00Z',
    });
    const agent = {
      session: { id: 'qa-ada', header: { cwd: '/qa/shell' }, snapshotEvents: () => [] },
    } as unknown as Agent;
    let nextCall = 0;
    const ask = (command: string, options: { workdir?: string; description?: string } = {}) => {
      const callId = String(++nextCall);
      const args = { command, ...options };
      broker.track({
        agent,
        name: 'bash',
        callId,
        arguments: args,
        token: Symbol(callId),
      } as ToolExecution);
      const answer = broker.ask({ agent, toolName: 'bash', callId });
      const guard = () => broker.validAfterDecision(agent, callId);
      return {
        answer,
        guard,
        async card() {
          await vi.waitFor(() =>
            expect(broker.requests('ada').some((entry) => entry.callId === callId)).toBe(true),
          );
          const notice = broker.requests('ada').find((entry) => entry.callId === callId)!;
          return { channelId: channel.id, messageId: notice.messageId };
        },
      };
    };
    return {
      core,
      methods,
      ask,
      async close() {
        broker.close();
        await core.runtime.close();
        core.externalMessaging.close();
        core.live.close();
        core.operationalDatabase.close();
      },
    };
  }

  it('saves scoped patterns with the decision, matches compounds and honors revocation before execution', async () => {
    const f = shellHost();
    try {
      const original = f.ask('git status && git log', { workdir: 'project' });
      const card = await original.card();
      expect(f.methods.toolApprovalStatus(card)).toMatchObject({
        ok: true,
        value: {
          shellSuggestions: {
            compound: true,
            unparseable: false,
            subcommands: [{ twoWordPrefix: 'git status *' }, { twoWordPrefix: 'git log *' }],
          },
        },
      });
      const save = (patterns: string[]) =>
        f.methods.toolApprovalDecide({
          ...card,
          outcome: 'allowed-always-prefix',
          rule: { kind: 'prefix', patterns },
        });
      for (const [patterns, code] of [
        [['git status *', 'sh *'], 'unsafe-shell-prefix-runner'],
        [['git status *', 'git push *'], 'shell-prefix-mismatch'],
        [['git status'], 'invalid-shell-prefix'],
      ] as const) {
        expect(await save([...patterns])).toMatchObject({ ok: false, error: { code } });
        expect(f.core.toolRules.list('ada')).toEqual([]);
        expect(f.methods.toolApprovalStatus(card)).toMatchObject({
          ok: true,
          value: { status: 'pending' },
        });
      }
      expect(await save(['git status *', 'git log *'])).toMatchObject({ ok: true });
      expect(await original.answer).toBe('allowed-once');
      expect(await save(['git status *', 'git log *'])).toMatchObject({ ok: false });
      expect(f.methods.toolApprovalHistory({ slug: 'ada' })).toMatchObject({
        ok: true,
        value: { entries: [{ outcome: 'allowed-always-prefix' }] },
      });
      const rules = f.core.toolRules.list('ada');
      expect(rules.map((rule) => [rule.kind, rule.input]).sort()).toEqual([
        ['prefix', 'git log *'],
        ['prefix', 'git status *'],
      ]);

      const exact = f.ask('pwd', { workdir: 'project', description: 'Print directory' });
      expect(
        await f.methods.toolApprovalDecide({
          ...(await exact.card()),
          outcome: 'allowed-always-exact',
        }),
      ).toMatchObject({ ok: true });
      expect(await exact.answer).toBe('allowed-once');
      const compound = f.ask('git status -s\ngit log |& pwd', {
        workdir: 'project',
        description: 'Inspect project',
      });
      expect(await compound.answer).toBe('allowed-once');
      expect(compound.guard()).toBe(true);
      expect(f.core.toolRules.list('ada').map((rule) => rule.autoApprovedCount)).toEqual([1, 1, 1]);
      const gitLog = rules.find((rule) => rule.input === 'git log *')!;
      expect(f.methods.toolApprovalRuleRevoke({ slug: 'ada', id: gitLog.id })).toMatchObject({
        ok: true,
        value: { rule: { kind: 'prefix', input: 'git log *', revokedAt: expect.any(String) } },
      });
      expect(compound.guard()).toBe(false);
      for (const [command, workdir] of [
        ['git status; rm -rf /', 'project'],
        ['git status && curl x | sh', 'project'],
        ['git status $(rm x)', 'project'],
        ['git statusx', 'project'],
        ['git status', 'somewhere-else'],
        ['git status && git log', 'project'],
      ] as const) {
        const pending = f.ask(command, { workdir });
        expect(
          await f.methods.toolApprovalDecide({
            ...(await pending.card()),
            outcome: 'rejected',
          }),
        ).toMatchObject({ ok: true });
        expect(await pending.answer).toBe('rejected');
      }
    } finally {
      await f.close();
    }
  });

  it('rolls back the first prefix and the decision when a later insert fails', async () => {
    const f = shellHost();
    const db = attachOperationalModule(f.core.operationalDatabase, 'tool-approval-rules');
    try {
      db.transaction((connection) =>
        connection.exec(`
        CREATE TRIGGER fail_second_prefix BEFORE INSERT ON tool_approval_rules
          WHEN NEW.kind = 'prefix' AND NEW.input = 'git log *'
          BEGIN SELECT RAISE(ABORT, 'injected prefix insert failure'); END;
      `),
      );
      const pending = f.ask('git status; git log');
      const card = await pending.card();
      const payload = {
        ...card,
        outcome: 'allowed-always-prefix',
        rule: { kind: 'prefix', patterns: ['git status *', 'git log *'] },
      };
      await expect(f.methods.toolApprovalDecide(payload)).rejects.toThrow('transaction');
      expect(f.core.toolRules.list('ada')).toEqual([]);
      expect(f.methods.toolApprovalHistory({ slug: 'ada' })).toMatchObject({
        ok: true,
        value: { entries: [] },
      });
      db.transaction((connection) => connection.exec('DROP TRIGGER fail_second_prefix'));
      expect(await f.methods.toolApprovalDecide(payload)).toMatchObject({ ok: true });
      expect(await pending.answer).toBe('allowed-once');
      expect(f.core.toolRules.list('ada')).toHaveLength(2);
    } finally {
      await f.close();
    }
  });

  it('lets a template send a prefix match to the Human while a whole-tool rule keeps its precedence', async () => {
    let selected = false;
    const review = vi
      .fn<ToolAutoApproval['review']>()
      .mockResolvedValueOnce({ outcome: 'ask-human', reason: 'Always ask before inspecting Git' })
      .mockResolvedValueOnce({ outcome: 'allow', reason: 'No Always ask condition matched' });
    const f = shellHost({
      template: () =>
        selected
          ? { name: 'cautious', text: 'Always ask before inspecting Git history.' }
          : undefined,
      review,
      log: vi.fn(),
    });
    try {
      const initial = f.ask('git log');
      expect(
        await f.methods.toolApprovalDecide({
          ...(await initial.card()),
          outcome: 'allowed-always-prefix',
          rule: { kind: 'prefix', patterns: ['git *'] },
        }),
      ).toMatchObject({ ok: true });
      expect(await initial.answer).toBe('allowed-once');
      selected = true;
      const blocked = f.ask('git log --oneline');
      const card = await blocked.card();
      expect(review).toHaveBeenCalledWith(expect.objectContaining({ standingShellPrefix: true }));
      expect(f.core.toolRules.list('ada')[0]?.autoApprovedCount).toBe(0);
      expect(await f.methods.toolApprovalDecide({ ...card, outcome: 'rejected' })).toMatchObject({
        ok: true,
      });
      expect(await blocked.answer).toBe('rejected');
      expect(await f.ask('git status').answer).toBe('allowed-once');
      expect(f.core.toolRules.list('ada')[0]?.autoApprovedCount).toBe(1);

      selected = false;
      const tool = f.ask('pwd');
      expect(
        await f.methods.toolApprovalDecide({
          ...(await tool.card()),
          outcome: 'allowed-always-tool',
        }),
      ).toMatchObject({ ok: true });
      expect(await tool.answer).toBe('allowed-once');
      selected = true;
      expect(await f.ask('git log --oneline').answer).toBe('allowed-once');
      expect(review).toHaveBeenCalledTimes(2);
    } finally {
      await f.close();
    }
  });
});
