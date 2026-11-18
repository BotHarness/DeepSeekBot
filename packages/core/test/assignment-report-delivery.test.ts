import { describe, expect, it, vi } from 'vitest';
import type { AssignmentAgentRun } from '../src/runtime/bot-runtime.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost, FAKE_BOT } from './dsh-agent-host-fixture.js';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';

const textOnly = 'Reply with Markdown as your final answer and nothing else. Do NOT call any tool.';

describe('Assignment report delivery contract', () => {
  it('keeps required reply transport distinct from text-only work on followup and steer', async () => {
    let finish = () => {};
    const pending = new Promise<void>((resolve) => (finish = resolve));
    const host = new FakeAgentHost({ kind: 'completed' }, { onTurn: () => pending });
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      ensureWorkspace: () => undefined,
    });
    const report = vi.fn();
    const run: AssignmentAgentRun = {
      sessionId: 'text-only-report',
      bot: FAKE_BOT,
      text: textOnly,
      permission: {
        grantId: 'grant-1',
        workspaceId: 'workspace-1',
        primaryCwd: '/project',
        mode: 'workspace-write',
        approval: 'ask',
        presetRevision: 0,
      },
      report,
    };
    const done = adapter.runAssignment(run).then(
      () => undefined,
      (error: unknown) => error,
    );
    try {
      await vi.waitFor(() => expect(host.received.get(run.sessionId)).toHaveLength(1));
      expect(host.received.get(run.sessionId)?.[0]?.content).toEqual([
        { type: 'text', text: textOnly },
        { type: 'text', text: expect.stringContaining('[Host Assignment report transport]') },
      ]);
      const role = host.scopes
        .get(run.sessionId)
        ?.sections.map((s) => s.text)
        .join('\n');
      expect(role).toContain('Ordinary assistant text stays private');
      expect(role).toContain('text-only');
      expect(
        adapter.requestAssignment({ ...run, text: 'Continue the same text-only review.' }),
      ).toEqual({
        delivery: 'steer',
      });
      expect(host.steered.get(run.sessionId)?.[0]?.content).toEqual([
        { type: 'text', text: 'Continue the same text-only review.' },
        { type: 'text', text: expect.stringContaining('[Host Assignment report transport]') },
      ]);
    } finally {
      finish();
      expect(await done).toEqual(new Error('Assignment finished without report_to_orchestrator'));
      expect(report).not.toHaveBeenCalled();
      await adapter.close();
    }
  });

  it('asks once for the missing report before failing the Assignment', async () => {
    let turns = 0;
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onTurn: async (_session, tools) => {
          if (++turns === 1) return;
          await tools
            .find((tool) => tool.name === 'report_to_orchestrator')!
            .execute({ state: 'completed', summary: 'The review is done' }, {} as ToolRunContext);
        },
      },
    );
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      ensureWorkspace: () => undefined,
    });
    const report = vi.fn(async () => ({}) as never);
    const completed = vi.fn();
    try {
      await adapter.runAssignment({
        sessionId: 'forgot-report',
        bot: FAKE_BOT,
        text: 'Review the change.',
        permission: {
          grantId: 'grant-1',
          workspaceId: 'workspace-1',
          primaryCwd: '/project',
          mode: 'workspace-write',
          approval: 'ask',
          presetRevision: 0,
        },
        report,
        completedTurn: completed,
      });
      expect(turns).toBe(2);
      expect(host.received.get('forgot-report')?.[1]?.content[0]).toMatchObject({
        text: expect.stringContaining('ended without report_to_orchestrator'),
      });
      expect(report).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'completed', summary: 'The review is done' }),
        expect.anything(),
      );
      expect(completed).toHaveBeenCalledTimes(2);
    } finally {
      await adapter.close();
    }
  });
});
