import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createEngineGateway } from '../src/engines/engine-gateway.js';
import { EngineHost } from '../src/engines/engine-host.js';
import type { EngineRole } from '../src/engines/engine-store.js';
import { engineWorkspaceMode } from '../src/workspaces/grant-execution.js';
import type { AssignmentPermissionSnapshot, WorkspaceGrant } from '../src/workspaces/grants.js';
import { claudeReplay, type ClaudeRecordedLine } from './fixtures/claude-replay.js';
import { codexReplay, type CodexReplay } from './fixtures/codex-replay.js';
import { memoryDsh } from './fixtures/engine-dsh.js';
import { createTempRoot } from './helpers.js';

const WORKSPACE_WRITE = {
  type: 'workspaceWrite',
  writableRoots: [],
  networkAccess: false,
  excludeTmpdirEnvVar: true,
  excludeSlashTmp: true,
};

const READ_TOOLS = ['Read', 'Glob', 'Grep'];
const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit', 'Bash', 'PowerShell'];

type Mode = 'read-only' | 'workspace-write' | 'danger-full-access';

const CASES = [
  {
    mode: 'read-only',
    codexPolicy: { type: 'readOnly', networkAccess: false },
    codexApproval: 'never',
    claudeMode: () => 'default',
  },
  {
    mode: 'workspace-write',
    codexPolicy: WORKSPACE_WRITE,
    codexApproval: 'on-request',
    claudeMode: (role: EngineRole) => (role === 'assignment' ? 'acceptEdits' : 'default'),
  },
  {
    mode: 'danger-full-access',
    codexPolicy: { type: 'dangerFullAccess' },
    codexApproval: 'never',
    claudeMode: () => 'bypassPermissions',
  },
] satisfies Array<{
  mode: Mode;
  codexPolicy: Record<string, unknown>;
  codexApproval: string;
  claudeMode(role: EngineRole): string;
}>;

const ROLES: EngineRole[] = ['assignment', 'orchestrator'];

it('uses the current Grant for both engine roles and refuses an unavailable Assignment Grant', () => {
  const grant: WorkspaceGrant = {
    id: 'fixture-grant',
    botSlug: 'ada',
    workspaceId: 'fixture-workspace',
    workspaceTitle: 'Fixture',
    workspacePath: '/fixture',
    createdAt: '2026-11-19T00:00:00Z',
    orchestratorWrite: false,
  };
  const permission: AssignmentPermissionSnapshot = {
    grantId: grant.id,
    workspaceId: grant.workspaceId,
    primaryCwd: grant.workspacePath,
    mode: 'workspace-write',
    approval: 'ask',
    presetRevision: 0,
  };
  const requireActive = vi.fn(() => grant);
  const core = { grants: { requireActive, list: () => [grant] } };
  expect(engineWorkspaceMode(core, 'ada', permission)).toBe('read-only');
  expect(engineWorkspaceMode(core, 'ada')).toBe('read-only');
  grant.orchestratorWrite = true;
  expect(engineWorkspaceMode(core, 'ada', permission)).toBe('workspace-write');
  expect(engineWorkspaceMode(core, 'ada')).toBe('workspace-write');
  grant.orchestratorWrite = false;
  expect(engineWorkspaceMode(core, 'ada', { ...permission, mode: 'danger-full-access' })).toBe(
    'danger-full-access',
  );
  requireActive.mockImplementation(() => {
    throw new Error('Workspace Grant is missing or revoked');
  });
  expect(() => engineWorkspaceMode(core, 'ada', permission)).toThrow('missing or revoked');
});

function claudePermissionProbes(): ClaudeRecordedLine[] {
  return WRITE_TOOLS.map((tool) => ({
    kind: 'permission',
    tool,
    input: { file_path: 'fixture.txt', command: 'echo fixture' },
    toolUseID: tool,
  }));
}

function codexRecording(resume: boolean, approval: boolean): Parameters<typeof codexReplay>[0] {
  const writeApproval: Parameters<typeof codexReplay>[0] = [
    { dir: 'in', msg: { id: 'fixture-approval', method: 'item/fileChange/requestApproval' } },
    { dir: 'out', msg: { id: 'fixture-approval', result: { decision: 'decline' } } },
    {
      dir: 'in',
      msg: { id: 'fixture-shell-approval', method: 'item/commandExecution/requestApproval' },
    },
    { dir: 'out', msg: { id: 'fixture-shell-approval', result: { decision: 'decline' } } },
  ];
  return [
    { dir: 'out', msg: { method: 'initialize', id: 1 } },
    { dir: 'in', msg: { id: 1, result: {} } },
    { dir: 'out', msg: { method: 'initialized' } },
    { dir: 'out', msg: { method: 'account/read', id: 2 } },
    { dir: 'in', msg: { id: 2, result: { account: { type: 'chatgpt', planType: 'plus' } } } },
    { dir: 'out', msg: { method: resume ? 'thread/resume' : 'thread/start', id: 3 } },
    { dir: 'in', msg: { id: 3, result: { thread: { id: 'thread-1' } } } },
    { dir: 'out', msg: { method: 'turn/start', id: 4 } },
    { dir: 'in', msg: { id: 4, result: { turn: { id: 'turn-1' } } } },
    ...(approval ? writeApproval : []),
    { dir: 'in', msg: { method: 'turn/completed', params: { turn: { status: 'completed' } } } },
  ];
}

function setup(initialMode: Mode, probeWrite: boolean) {
  const root = createTempRoot('engine-write-authority-');
  const cwd = join(root, 'project');
  mkdirSync(cwd);
  const gateway = createEngineGateway();
  const dsh = memoryDsh();
  let mode = initialMode;
  const changeMode = (next: Mode) => (mode = next);
  const codex: CodexReplay[] = [];
  const claudeTurn: ClaudeRecordedLine[] = [
    { kind: 'account', info: { subscriptionType: 'Pro', apiKeySource: 'none' } },
    { kind: 'await-input' },
    ...(probeWrite ? claudePermissionProbes() : []),
    { kind: 'message', msg: { type: 'result', subtype: 'success' } },
  ];
  const claude = claudeReplay([claudeTurn, claudeTurn]);
  const approve = vi.fn(async () => 'allowed-once' as const);
  const host = new EngineHost({
    root,
    local: true,
    claudeCommand: process.execPath,
    gateway,
    sessions: () => dsh.store,
    persistence: () => dsh.persistence,
    approve,
    openClaude: claude.factory,
    detectClaude: async () => ({ installed: true, version: '2.1.327', login: 'subscription' }),
    openCodex: (options) => {
      const replay = codexReplay(codexRecording(codex.length > 0, probeWrite), options);
      codex.push(replay);
      return replay.transport;
    },
  });
  const turn = (role: EngineRole) =>
    host.runTurn({
      botSlug: 'ada',
      role,
      cwd,
      workspaceMode: () => mode,
      sessionId: 'session-fixture',
      channelId: undefined,
      instructions: '',
      input: 'Check the fixture',
      tools: [],
      execute: async () => undefined,
      signal: new AbortController().signal,
    });
  return {
    host,
    cwd,
    approve,
    claude,
    codex,
    changeMode,
    turn,
    close: async () => {
      await host.close();
      await gateway.close();
    },
  };
}

describe.each(ROLES)('%s engine workspace authority', (role) => {
  it.each(CASES)('sets Codex sandbox and approvals for $mode', async (config) => {
    const fixture = setup(config.mode, config.mode === 'read-only');
    try {
      fixture.host.use('ada', role, 'codex');
      await fixture.turn(role);
      const replay = fixture.codex[0]!;
      const params = (method: string) =>
        replay.sent.find((message) => message['method'] === method)?.['params'];
      expect(params('thread/start')).toMatchObject({
        cwd: fixture.cwd,
        sandbox: config.mode,
        approvalPolicy: config.codexApproval,
      });
      expect(params('turn/start')).toMatchObject({
        sandboxPolicy: config.codexPolicy,
        approvalPolicy: config.codexApproval,
      });
      expect(replay.mismatches).toEqual([]);
      expect(fixture.approve).not.toHaveBeenCalled();
    } finally {
      await fixture.close();
    }
  });

  it.each(CASES)('sets Claude permissions for $mode', async (config) => {
    const fixture = setup(config.mode, config.mode === 'read-only');
    try {
      fixture.host.use('ada', role, 'claude');
      await fixture.turn(role);
      const options = fixture.claude.options[0]!;
      expect(options.cwd).toBe(fixture.cwd);
      expect(options.permissionMode).toBe(config.claudeMode(role));
      expect(options.allowDangerouslySkipPermissions).toBe(
        config.mode === 'danger-full-access' ? true : undefined,
      );
      expect(options.tools).toEqual(config.mode === 'read-only' ? READ_TOOLS : undefined);
      expect(options.disallowedTools).toEqual(
        config.mode === 'read-only' ? WRITE_TOOLS : undefined,
      );
      expect(options.settings).toEqual(
        config.mode === 'workspace-write'
          ? { permissions: { ask: ['Bash', 'PowerShell'] } }
          : undefined,
      );
      if (config.mode === 'read-only')
        expect(fixture.claude.permissions).toEqual(
          WRITE_TOOLS.map((tool) => ({
            tool,
            decision: { behavior: 'deny', message: expect.stringMatching(/read.only/i) },
          })),
        );
      expect(fixture.approve).not.toHaveBeenCalled();
    } finally {
      await fixture.close();
    }
  });
});

it.each(ROLES)(
  'reopens live %s engines with the current authority and retained history',
  async (role) => {
    const codex = setup('workspace-write', false);
    const claude = setup('danger-full-access', false);
    try {
      codex.host.use('ada', role, 'codex');
      claude.host.use('ada', role, 'claude');
      await codex.turn(role);
      await claude.turn(role);
      codex.changeMode('read-only');
      claude.changeMode('read-only');
      await codex.turn(role);
      await claude.turn(role);
      expect(codex.codex[0]?.closed).toBe(true);
      expect(
        codex.codex[1]?.sent.find((message) => message['method'] === 'thread/resume')?.['params'],
      ).toMatchObject({ threadId: 'thread-1', sandbox: 'read-only', approvalPolicy: 'never' });
      expect(codex.codex[1]?.mismatches).toEqual([]);
      expect(claude.claude.closed).toBeGreaterThan(0);
      expect(claude.claude.options[1]).toMatchObject({
        resume: claude.claude.options[0]?.sessionId,
        tools: READ_TOOLS,
        permissionMode: 'default',
      });
    } finally {
      await codex.close();
      await claude.close();
    }
  },
);
