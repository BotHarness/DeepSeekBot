import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { OrchestratorAgentRun } from '../../runtime/bot-runtime.js';

export interface WorkspaceAgentContext {
  currentRun(): OrchestratorAgentRun | undefined;
  workspaceSessionsAvailable?: boolean;
}

export function registerWorkspaceTools(
  { currentRun, workspaceSessionsAvailable }: WorkspaceAgentContext,
  registerTool: (tool: ToolDefinition) => void,
): void {
  registerTool(
    defineTool({
      name: 'request_workspace_grant',
      description:
        'Ask the Human to authorize a folder so the current task can continue. The request card appears in the current inbound Channel, a Group or your Human DM. Use when no active writable Workspace Grant fits, including a read-only directory that needs write access; this does not create an Assignment.',
      parameters: {
        channel_id: {
          type: 'string',
          description:
            'Explicit joined Channel; required when called by the direct CLI outside a turn.',
        },
        reason: {
          type: 'string',
          required: true,
          description: 'Briefly explain which work needs folder access.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => {
        const run = currentRun();
        if (run === undefined) {
          throw new Error('request_workspace_grant: Orchestrator run is unavailable');
        }
        const message = await run.channels.requestGrant(args.reason, args.channel_id);
        return `Sent Workspace Grant request card ${message.id}; wait for Human authorization.`;
      },
    }),
  );
  registerTool(
    defineTool({
      name: 'list_workspace_grants',
      description:
        'List Human-authorized Workspace Grants for this PersonaBot. Only active Grant ids can be passed to create_assignment.',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async () => {
        const run = currentRun();
        if (run === undefined) {
          throw new Error('list_workspace_grants: Orchestrator run is unavailable');
        }
        return JSON.stringify(run.assignments.grants());
      },
    }),
  );
  if (workspaceSessionsAvailable)
    registerTool(
      defineTool({
        name: 'workspace_sessions',
        description:
          "Read the Human's own DeepSeek Sessions that worked inside one of your active Workspace Grants. Omit session_id to list them newest first (id, title, folder, last activity); pass a session_id to read that Session as Markdown: Human requests, assistant replies and one line per tool call. Read-only; a Session outside your Grants is refused.",
        parameters: { session_id: { type: 'string' } },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        execute: async (args) => {
          const sessions = currentRun()?.workspaceSessions;
          if (sessions === undefined) throw new Error('workspace-sessions-unavailable');
          const id = typeof args.session_id === 'string' ? args.session_id.trim() : '';
          if (id === '') return JSON.stringify({ sessions: await sessions.list() });
          return sessions.read(id);
        },
      }),
    );
}
