import { describe, expect, it, vi } from 'vitest';

import {
  deviceToolAuthorization,
  grantExecutionDenial,
  isDshGovernedTool,
  grantToolExecutionDenial,
  orchestratorPermission,
  requiresHumanToolApproval,
  sessionHasFullAccess,
} from '../src/workspaces/grant-execution.js';

const botSlug = 'ada';
const assignmentSessionId = 'botharness-assignment';
const grantId = 'grant-1';
const cwd = '/tmp/grant-workspace';

function fixture() {
  const resolve = vi.fn((sessionId: string) =>
    sessionId === assignmentSessionId
      ? {
          sessionId,
          botSlug,
          rootRole: 'assignment',
          parentSessionId: undefined,
        }
      : sessionId === 'botharness-orchestrator'
        ? {
            sessionId,
            botSlug,
            rootRole: 'orchestrator',
            parentSessionId: undefined,
          }
        : undefined,
  );
  const requireActive = vi.fn(() => ({
    id: grantId,
    workspaceId: 'workspace-1',
    workspacePath: cwd,
  }));
  const getAssignment = vi.fn(() => ({
    permission: {
      grantId,
      workspaceId: 'workspace-1',
      primaryCwd: cwd,
      mode: 'workspace-write',
      approval: 'ask',
      presetRevision: 0,
    },
  }));
  const overrideOf = vi.fn(() => 'ask');
  const getBot = vi.fn((): { slug: string } | undefined => ({ slug: botSlug }));
  const memoryDirFor = vi.fn(() => '/tmp/memory');
  const core = {
    ownership: { resolve },
    runtime: { getAssignment },
    grants: { requireActive },
    registry: { memoryDirFor, get: getBot },
    hostTools: new Set<string>(),
  } as never;
  const resolvePolicy = vi.fn(() => ({ mode: 'workspace-write' }));
  const policy = { resolve: resolvePolicy } as never;
  const approval = { overrideOf } as never;
  const assignment = { id: assignmentSessionId, header: { cwd } } as never;
  return {
    core,
    policy,
    approval,
    assignment,
    requireActive,
    resolvePolicy,
    getAssignment,
    overrideOf,
    memoryDirFor,
    getBot,
  };
}

describe('Workspace Grant execution boundary', () => {
  it('recognizes full access from an Assignment snapshot or the chat-scoped preset only', () => {
    const state = fixture();
    const get = vi.fn((): { mode: string; scope: string } | undefined => undefined);
    const core = {
      ...(state.core as object),
      assignmentAccess: { get },
    } as never;
    expect(sessionHasFullAccess(core, assignmentSessionId)).toBe(false);
    expect(sessionHasFullAccess(core, 'botharness-orchestrator')).toBe(false);
    expect(sessionHasFullAccess(core, 'native-session')).toBe(false);
    state.getAssignment.mockReturnValue({
      permission: {
        grantId,
        workspaceId: 'workspace-1',
        primaryCwd: cwd,
        mode: 'danger-full-access',
        approval: 'never',
        presetRevision: 1,
      },
    });
    expect(sessionHasFullAccess(core, assignmentSessionId)).toBe(true);
    get.mockReturnValue({ mode: 'danger-full-access', scope: 'assignments' });
    expect(sessionHasFullAccess(core, 'botharness-orchestrator')).toBe(false);
    get.mockReturnValue({ mode: 'danger-full-access', scope: 'chat' });
    expect(sessionHasFullAccess(core, 'botharness-orchestrator')).toBe(true);
  });

  it('authorizes Browser and Computer tools for full access without asking the Human', () => {
    const granted = new Set<string>();
    const markAuthorized = vi.fn((sessionId: string, _scope?: string): boolean | void => {
      granted.add(sessionId);
    });
    const tools = {
      needsAuthorization: (sessionId: string) => !granted.has(sessionId),
      authorizationScope: () => 'local:default',
      markAuthorized,
    };
    expect(deviceToolAuthorization(tools, 'ask-session', false)).toBe('ask');
    expect(markAuthorized).not.toHaveBeenCalled();
    expect(deviceToolAuthorization(tools, 'full-session', true)).toBe('authorized');
    expect(markAuthorized).toHaveBeenCalledWith('full-session', 'local:default');
    expect(deviceToolAuthorization(tools, 'full-session', false)).toBe('authorized');
    markAuthorized.mockReturnValue(false);
    expect(deviceToolAuthorization(tools, 'changed-session', true)).toBe('changed');
    expect(deviceToolAuthorization({}, 'bare-session', true)).toBe('authorized');
  });

  it('denies deleted native roots and saved tool approvals even with retained Memory cwd', () => {
    const state = fixture();
    state.getBot.mockReturnValue(undefined);
    const session = {
      id: 'botharness-orchestrator',
      header: { cwd: '/tmp/memory' },
    } as never;
    expect(grantExecutionDenial(state.core, session, state.policy, state.approval)).toBe(
      'PersonaBot identity is deleted or unavailable',
    );
    expect(
      grantToolExecutionDenial(state.core, session, state.policy, state.approval, 'read', {
        file_path: '/tmp/memory/PERSONA.md',
      }),
    ).toBe('PersonaBot identity is deleted or unavailable');
    expect(grantExecutionDenial(state.core, state.assignment, state.policy, state.approval)).toBe(
      'PersonaBot identity is deleted or unavailable',
    );
    expect(state.overrideOf).not.toHaveBeenCalled();
    expect(state.requireActive).not.toHaveBeenCalled();
  });

  it('treats Host-checked Bot DM contact tools as internal Messaging tools', () => {
    expect(requiresHumanToolApproval('list_bot_contacts')).toBe(false);
    expect(requiresHumanToolApproval('bridge_reachable_groups')).toBe(false);
    expect(requiresHumanToolApproval('channel_list')).toBe(false);
    expect(requiresHumanToolApproval('inbox_ignore')).toBe(false);
    expect(requiresHumanToolApproval('inbox_history')).toBe(false);
    expect(requiresHumanToolApproval('inbox_list')).toBe(false);
    expect(requiresHumanToolApproval('inbox_resolve')).toBe(false);
    expect(requiresHumanToolApproval('inbox_snooze')).toBe(false);
    expect(requiresHumanToolApproval('archive_assignment')).toBe(false);
    expect(requiresHumanToolApproval('unarchive_assignment')).toBe(false);
    for (const tool of [
      'group_create',
      'group_invite_bot',
      'group_invite_respond',
      'group_rename',
      'group_remove_member',
      'group_leave',
    ])
      expect(requiresHumanToolApproval(tool)).toBe(false);
    expect(requiresHumanToolApproval('bot_dm_send')).toBe(false);
    for (const tool of [
      'bot_schedule_list',
      'bot_schedule_create',
      'bot_schedule_update',
      'bot_schedule_delete',
    ])
      expect(requiresHumanToolApproval(tool)).toBe(false);
  });

  it('leaves Shell, plugin tools and their DSH escalation asks to the Session mode', () => {
    const state = fixture();
    const session = {
      id: 'botharness-orchestrator',
      header: { cwd: '/tmp/memory' },
    } as never;
    for (const tool of [
      'bridge_sender_permissions',
      'bridge_directory',
      'bridge_attachment_save',
      'bridge_reply_file',
    ]) {
      expect(requiresHumanToolApproval(tool)).toBe(false);
      expect(isDshGovernedTool(tool)).toBe(false);
      expect(
        grantToolExecutionDenial(state.core, session, state.policy, state.approval, tool, {}),
      ).toBeUndefined();
    }
    for (const tool of ['bash', 'pwsh', 'ops_bash', 'terminal', 'run_code']) {
      expect(requiresHumanToolApproval(tool)).toBe(false);
      expect(isDshGovernedTool(tool)).toBe(true);
      for (const args of [
        { command: 'unzip source-orders.zip' },
        {
          command: 'touch /outside',
          sandbox_permissions: 'require_escalated',
          justification: 'x',
        },
      ])
        expect(
          grantToolExecutionDenial(state.core, session, state.policy, state.approval, tool, args),
        ).toBeUndefined();
    }
    expect(isDshGovernedTool('read')).toBe(false);
    expect(isDshGovernedTool('channel_attachment_open')).toBe(false);
  });

  it('keeps each-use approval for secret tools', () => {
    const state = fixture();
    for (const tool of ['secret_cli', 'secret_mcp_connect']) {
      expect(requiresHumanToolApproval(tool)).toBe(true);
      expect(
        grantToolExecutionDenial(
          state.core,
          state.assignment,
          state.policy,
          state.approval,
          tool,
          {},
        ),
      ).toMatch(/requires Human approval/);
      expect(
        grantToolExecutionDenial(
          state.core,
          state.assignment,
          state.policy,
          state.approval,
          tool,
          {},
          true,
        ),
      ).toBeUndefined();
    }
  });

  it('requires approval for original editing while allowing exact read acquisition', () => {
    const state = fixture();
    const session = {
      id: 'botharness-orchestrator',
      header: { cwd: '/tmp/memory' },
    } as never;
    expect(requiresHumanToolApproval('channel_attachment_open', { access: 'read' })).toBe(false);
    expect(
      requiresHumanToolApproval('channel_attachment_open', {
        access: 'edit-original',
      }),
    ).toBe(true);
    expect(requiresHumanToolApproval('channel_attachment_open', {})).toBe(true);
    const gate = (access: string, approved = false) =>
      grantToolExecutionDenial(
        state.core,
        session,
        state.policy,
        state.approval,
        'channel_attachment_open',
        { access },
        approved,
      );
    expect(gate('read')).toBeUndefined();
    expect(gate('edit-original')).toMatch(/Human approval/);
    expect(gate('edit-original', true)).toBeUndefined();
  });

  it('puts bot_create through Human tool approval unless allowed or full access', () => {
    const state = fixture();
    const session = {
      id: 'botharness-orchestrator',
      header: { cwd: '/tmp/memory' },
    } as never;
    expect(requiresHumanToolApproval('bot_create', { display_name: 'Tim' })).toBe(true);
    expect(isDshGovernedTool('bot_create')).toBe(false);
    const gate = (approved = false) =>
      grantToolExecutionDenial(
        state.core,
        session,
        state.policy,
        state.approval,
        'bot_create',
        { display_name: 'Tim' },
        approved,
      );
    expect(gate()).toMatch(/Human tool approval/);
    expect(gate(true)).toBeUndefined();
    (state.core as { assignmentAccess?: unknown }).assignmentAccess = {
      get: () => ({ mode: 'danger-full-access', scope: 'chat' }),
    };
    state.resolvePolicy.mockReturnValue({ mode: 'danger-full-access' });
    state.overrideOf.mockReturnValue('never');
    expect(gate()).toBeUndefined();
  });

  it('allows a valid Assignment and rejects native resume after revoke', () => {
    const state = fixture();
    expect(
      grantExecutionDenial(state.core, state.assignment, state.policy, state.approval),
    ).toBeUndefined();
    state.requireActive.mockImplementation(() => {
      throw new Error('revoked');
    });
    expect(
      grantExecutionDenial(state.core, state.assignment, state.policy, state.approval),
    ).toMatch(/revoked/);
  });

  it('allows DSH Subagents with native never approval only under the inherited Assignment Grant', () => {
    const state = fixture();
    const childId = 'dsh-child';
    const child = {
      id: childId,
      header: { cwd, parentSession: assignmentSessionId },
    } as never;
    const resolve = (state.core as { ownership: { resolve: ReturnType<typeof vi.fn> } }).ownership
      .resolve;
    resolve.mockImplementation((sessionId: string) =>
      sessionId === childId
        ? {
            sessionId,
            botSlug,
            rootRole: 'assignment',
            provenance: 'subagent',
            parentSessionId: assignmentSessionId,
          }
        : sessionId === assignmentSessionId
          ? {
              sessionId,
              botSlug,
              rootRole: 'assignment',
              parentSessionId: undefined,
            }
          : undefined,
    );
    state.overrideOf.mockReturnValue('never');
    expect(grantExecutionDenial(state.core, child, state.policy, state.approval)).toBeUndefined();
    state.resolvePolicy.mockReturnValue({ mode: 'danger-full-access' });
    expect(grantExecutionDenial(state.core, child, state.policy, state.approval)).toMatch(
      /mode differs/,
    );
    state.resolvePolicy.mockReturnValue({ mode: 'workspace-write' });
    resolve.mockImplementation((sessionId: string) =>
      sessionId === childId
        ? {
            sessionId,
            botSlug,
            rootRole: 'assignment',
            provenance: 'subagent',
            parentSessionId: assignmentSessionId,
          }
        : undefined,
    );
    expect(grantExecutionDenial(state.core, child, state.policy, state.approval)).toMatch(
      /parent ownership is missing/,
    );
  });

  it('denies a mid-step native danger mode switch before a tool body', () => {
    const state = fixture();
    state.resolvePolicy.mockReturnValue({ mode: 'danger-full-access' });
    expect(
      grantExecutionDenial(state.core, state.assignment, state.policy, state.approval),
    ).toMatch(/mode differs/);
  });

  it('honors an immutable dangerous Assignment snapshot but still checks its Grant', () => {
    const state = fixture();
    state.getAssignment.mockReturnValue({
      permission: {
        grantId,
        workspaceId: 'workspace-1',
        primaryCwd: cwd,
        mode: 'danger-full-access',
        approval: 'never',
        presetRevision: 1,
      },
    });
    state.resolvePolicy.mockReturnValue({ mode: 'danger-full-access' });
    state.overrideOf.mockReturnValue('never');
    expect(
      grantExecutionDenial(state.core, state.assignment, state.policy, state.approval),
    ).toBeUndefined();
    expect(
      grantToolExecutionDenial(state.core, state.assignment, state.policy, state.approval, 'read', {
        file_path: '/outside/secret.txt',
      }),
    ).toBeUndefined();
    expect(
      grantToolExecutionDenial(state.core, state.assignment, state.policy, state.approval, 'bash', {
        command: 'pwd',
      }),
    ).toBeUndefined();
    state.requireActive.mockImplementation(() => {
      throw new Error('revoked');
    });
    expect(
      grantToolExecutionDenial(state.core, state.assignment, state.policy, state.approval, 'bash', {
        command: 'pwd',
      }),
    ).toMatch(/revoked/);
  });

  it('lets only the Orchestrator reach the native Human-question answerer', () => {
    const state = fixture();
    const orchestrator = {
      id: 'botharness-orchestrator',
      header: { cwd: '/tmp/memory' },
    } as never;
    expect(
      grantToolExecutionDenial(
        state.core,
        orchestrator,
        state.policy,
        state.approval,
        'ask_user_question',
        {},
      ),
    ).toBeUndefined();
    expect(
      grantToolExecutionDenial(
        state.core,
        state.assignment,
        state.policy,
        state.approval,
        'ask_user_question',
        {},
      ),
    ).toMatch(/Orchestrator/);
  });

  it('lets registered host-owned and unknown plugin tools through the Grant gate', () => {
    const state = fixture();
    const core = state.core as unknown as { hostTools: Set<string> };
    core.hostTools.add('computer_click');
    expect(
      grantToolExecutionDenial(
        state.core,
        state.assignment,
        state.policy,
        state.approval,
        'computer_click',
        {},
      ),
    ).toBeUndefined();
    expect(
      grantToolExecutionDenial(
        state.core,
        state.assignment,
        state.policy,
        state.approval,
        'computer_unregistered',
        {},
      ),
    ).toBeUndefined();
  });

  it('still rechecks the Grant before a Shell call runs', () => {
    const state = fixture();
    expect(
      grantToolExecutionDenial(state.core, state.assignment, state.policy, state.approval, 'bash', {
        command: 'pwd',
      }),
    ).toBeUndefined();
    state.requireActive.mockImplementation(() => {
      throw new Error('revoked');
    });
    expect(
      grantToolExecutionDenial(state.core, state.assignment, state.policy, state.approval, 'bash', {
        command: 'pwd',
      }),
    ).toMatch(/revoked/);
  });
  it('keeps DSH native file tools inside the Grant', () => {
    const state = fixture();
    expect(
      grantToolExecutionDenial(state.core, state.assignment, state.policy, state.approval, 'read', {
        file_path: 'missing.txt',
      }),
    ).toMatch(/cannot be resolved|outside/);
  });
  it('fails closed if a BotHarness-created Session loses its durable owner', () => {
    const state = fixture();
    const orphaned = { id: 'botharness-orphaned', header: { cwd } } as never;
    expect(grantExecutionDenial(state.core, orphaned, state.policy, state.approval)).toMatch(
      /no durable owner/,
    );
  });
  it('fails closed for an unclaimed native fork of an owned Session', () => {
    const state = fixture();
    const fork = {
      id: 'native-fork-id',
      header: { cwd, parentSession: assignmentSessionId },
    } as never;
    expect(grantExecutionDenial(state.core, fork, state.policy, state.approval)).toMatch(
      /no durable owner/,
    );
  });
  it('denies a native Orchestrator mode switch and ignores unrelated DSH sessions', () => {
    const state = fixture();
    state.resolvePolicy.mockReturnValue({ mode: 'danger-full-access' });
    const orchestrator = {
      id: 'botharness-orchestrator',
      header: { cwd: '/tmp/memory' },
    } as never;
    expect(grantExecutionDenial(state.core, orchestrator, state.policy, state.approval)).toMatch(
      /differs from this PersonaBot's access setting/,
    );
    const ordinary = { id: 'native-dsh', header: { cwd } } as never;
    expect(
      grantExecutionDenial(state.core, ordinary, state.policy, state.approval),
    ).toBeUndefined();
    expect(
      grantToolExecutionDenial(state.core, ordinary, state.policy, state.approval, 'bash', {
        sandbox_permissions: 'danger-full-access',
      }),
    ).toBeUndefined();
  });
  it('runs the Orchestrator unconfined only while the PersonaBot access setting is full access', () => {
    const state = fixture();
    const orchestrator = {
      id: 'botharness-orchestrator',
      header: { cwd: '/tmp/memory' },
    } as never;
    let mode: 'workspace-write' | 'danger-full-access' = 'danger-full-access';
    let scope: 'chat' | 'assignments' = 'assignments';
    const core = {
      ...(state.core as object),
      assignmentAccess: { get: () => ({ botSlug, mode, scope, revision: 1 }) },
    } as never;
    expect(orchestratorPermission(core, botSlug)).toEqual({
      mode: 'workspace-write',
      approval: 'ask',
    });
    expect(grantExecutionDenial(core, orchestrator, state.policy, state.approval)).toBeUndefined();
    scope = 'chat';
    expect(orchestratorPermission(core, botSlug)).toEqual({
      mode: 'danger-full-access',
      approval: 'never',
    });
    expect(grantExecutionDenial(core, orchestrator, state.policy, state.approval)).toMatch(
      /differs from this PersonaBot's access setting/,
    );
    state.resolvePolicy.mockReturnValue({ mode: 'danger-full-access' });
    state.overrideOf.mockReturnValue('never');
    expect(grantExecutionDenial(core, orchestrator, state.policy, state.approval)).toBeUndefined();
    expect(
      grantToolExecutionDenial(core, orchestrator, state.policy, state.approval, 'bash', {
        command: 'touch /outside/project/file',
      }),
    ).toBeUndefined();
    expect(
      grantToolExecutionDenial(core, orchestrator, state.policy, state.approval, 'write', {
        file_path: '/outside/project/file',
        content: 'x',
      }),
    ).toBeUndefined();
    mode = 'workspace-write';
    expect(orchestratorPermission(core, botSlug)).toEqual({
      mode: 'workspace-write',
      approval: 'ask',
    });
    expect(grantExecutionDenial(core, orchestrator, state.policy, state.approval)).toMatch(
      /differs from this PersonaBot's access setting/,
    );
  });
});

it('does not keep retired Tob management tools in the Bot tool policy', () => {
  expect(isDshGovernedTool('tob_assignment_limit_read')).toBe(true);
  expect(isDshGovernedTool('tob_assignment_limit_set')).toBe(true);
});
