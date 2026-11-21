import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { MemoryAcceptError } from '../../memory/accepted.js';
import type { OrchestratorAgentRun } from '../../runtime/bot-runtime.js';

type MemoryToolRun = Pick<OrchestratorAgentRun, 'memory'> & {
  assignments: Pick<OrchestratorAgentRun['assignments'], 'list'>;
  channels: Pick<OrchestratorAgentRun['channels'], 'send'>;
};

export function registerMemoryTools(
  currentRun: () => MemoryToolRun | undefined,
  registerTool: (tool: ToolDefinition) => unknown,
): void {
  registerTool(
    defineTool({
      name: 'memory_switch_branch',
      description:
        'Switch this PersonaBot Memory Repository to an existing local Git branch. Use for a clear Human branch-switch request; do not create or reset branches.',
      parameters: {
        branch: {
          type: 'string',
          required: true,
          description: 'Exact existing local branch name.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => {
        const active = currentRun();
        if (active === undefined) {
          throw new Error('memory_switch_branch: Orchestrator run is unavailable');
        }
        if (active.memory === undefined) throw new Error('Memory is unavailable');
        await active.channels.send({ body: `正在切换记忆分支：${args.branch}` });
        try {
          const result = active.memory.switchBranch(args.branch);
          await active.channels.send({
            body: `记忆分支已从 ${result.from} 切换到 ${result.to}（${result.head.slice(0, 12)}）。`,
          });
          return JSON.stringify({ outcome: 'switched', ...result });
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          const blocked = error instanceof MemoryAcceptError && error.code === 'memory-conflict';
          const workingAssignments = blocked
            ? active.assignments
                .list()
                .filter((assignment) => assignment.activity === 'working')
                .map((assignment) => ({
                  sessionId: assignment.sessionId,
                  title: assignment.title,
                  workspace: assignment.permission?.primaryCwd,
                }))
            : [];
          await active.channels.send({
            body: blocked
              ? `记忆分支 ${args.branch} 尚未切换：${detail}。当前分支与未完成改动已保留。`
              : `记忆分支 ${args.branch} 切换失败：${detail}`,
          });
          return JSON.stringify({
            outcome: blocked ? 'blocked' : 'failed',
            branch: args.branch,
            detail,
            workingAssignments,
          });
        }
      },
    }),
  );
  registerTool(
    defineTool({
      name: 'memory_continue_from_commit',
      description:
        'Create and switch to a new local Memory Git branch at an exact historical commit chosen by the Human. The branch name must be new. The checked-out files become current Memory immediately.',
      parameters: {
        sha: {
          type: 'string',
          required: true,
          description: 'Full 40-character Git commit SHA.',
        },
        branch: {
          type: 'string',
          required: true,
          description: 'New local Git branch name chosen by the Human.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => {
        const active = currentRun();
        if (active === undefined) {
          throw new Error('memory_continue_from_commit: Orchestrator run is unavailable');
        }
        if (active.memory === undefined) throw new Error('Memory is unavailable');
        await active.channels.send({
          body: '正在从提交 ' + args.sha.slice(0, 12) + ' 创建记忆分支：' + args.branch,
        });
        try {
          const result = active.memory.continueFromCommit(args.sha, args.branch);
          await active.channels.send({
            body: '已从提交 ' + result.head.slice(0, 12) + ' 创建并切换到分支 ' + result.to + '。',
          });
          return JSON.stringify({ outcome: 'created', ...result });
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          await active.channels.send({ body: '从历史提交继续失败：' + detail });
          return JSON.stringify({
            outcome: 'failed',
            sha: args.sha,
            branch: args.branch,
            detail,
          });
        }
      },
    }),
  );
}
