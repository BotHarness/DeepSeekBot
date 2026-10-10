import { mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  grantExecutionDenial,
  isSafeMemoryDirectoryListing,
  grantToolExecutionDenial,
  requiresHumanToolApproval,
} from '../src/workspaces/grant-execution.js';

const botSlug = 'ada';
const assignmentSessionId = 'botharness-assignment';
const grantId = 'grant-1';
const cwd = '/tmp/grant-workspace';

function fixture() {
  const resolve = vi.fn((sessionId: string) =>
    sessionId === assignmentSessionId
      ? { sessionId, botSlug, rootRole: 'assignment', parentSessionId: undefined }
      : sessionId === 'botharness-orchestrator'
        ? { sessionId, botSlug, rootRole: 'orchestrator', parentSessionId: undefined }
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
  it('denies deleted native roots and saved tool approvals even with retained Memory cwd', () => {
    const state = fixture();
    state.getBot.mockReturnValue(undefined);
    const session = { id: 'botharness-orchestrator', header: { cwd: '/tmp/memory' } } as never;
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
    expect(requiresHumanToolApproval('channel_list')).toBe(false);
    expect(requiresHumanToolApproval('inbox_ignore')).toBe(false);
    expect(requiresHumanToolApproval('inbox_history')).toBe(false);
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

  it('keeps checked external file operations internal while retaining Shell approval', () => {
    const state = fixture();
    const session = { id: 'botharness-orchestrator', header: { cwd: '/tmp/memory' } } as never;
    for (const tool of [
      'bridge_sender_permissions',
      'bridge_attachment_save',
      'bridge_reply_file',
    ]) {
      expect(requiresHumanToolApproval(tool)).toBe(false);
      expect(
        grantToolExecutionDenial(state.core, session, state.policy, state.approval, tool, {}),
      ).toBeUndefined();
      expect(
        grantToolExecutionDenial(state.core, session, state.policy, state.approval, tool, {
          sandbox_permissions: 'require_escalated',
        }),
      ).toMatch(/cannot request sandbox permission escalation/);
    }
    expect(requiresHumanToolApproval('bash')).toBe(true);
    expect(
      grantToolExecutionDenial(state.core, session, state.policy, state.approval, 'bash', {
        command: 'unzip source-orders.zip',
      }),
    ).toBe('BotHarness Session cannot run an unconfined native tool: bash');
    expect(
      grantToolExecutionDenial(
        state.core,
        session,
        state.policy,
        state.approval,
        'bash',
        { command: 'unzip source-orders.zip' },
        true,
      ),
    ).toBeUndefined();
  });

  it('requires approval for original editing while allowing exact read acquisition', () => {
    const state = fixture();
    const session = { id: 'botharness-orchestrator', header: { cwd: '/tmp/memory' } } as never;
    expect(requiresHumanToolApproval('channel_attachment_open', { access: 'read' })).toBe(false);
    expect(requiresHumanToolApproval('channel_attachment_open', { access: 'edit-original' })).toBe(
      true,
    );
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
    const child = { id: childId, header: { cwd, parentSession: assignmentSessionId } } as never;
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
          ? { sessionId, botSlug, rootRole: 'assignment', parentSessionId: undefined }
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

  it('lets an Orchestrator list its own Memory directory without a Human approval', () => {
    const state = fixture();
    const memory = realpathSync(mkdtempSync(join(tmpdir(), 'botharness-memory-listing-')));
    state.memoryDirFor.mockReturnValue(memory);
    const orchestrator = { id: 'botharness-orchestrator', header: { cwd: memory } } as never;
    const allowed = { command: 'ls -la', description: 'List memory repository contents' };
    try {
      expect(isSafeMemoryDirectoryListing(state.core, orchestrator, 'bash', allowed)).toBe(true);
      expect(
        grantToolExecutionDenial(
          state.core,
          orchestrator,
          state.policy,
          state.approval,
          'bash',
          allowed,
        ),
      ).toBeUndefined();
      for (const args of [
        { command: 'ls -la /tmp' },
        { command: 'ls -la; cat /etc/passwd' },
        { command: 'ls -la', workdir: '/tmp' },
        { command: 'ls -la', run_in_background: true },
      ]) {
        expect(isSafeMemoryDirectoryListing(state.core, orchestrator, 'bash', args)).toBe(false);
        expect(
          grantToolExecutionDenial(
            state.core,
            orchestrator,
            state.policy,
            state.approval,
            'bash',
            args,
          ),
        ).toMatch(/unconfined native tool/);
      }
      const assignment = { id: assignmentSessionId, header: { cwd: memory } } as never;
      expect(isSafeMemoryDirectoryListing(state.core, assignment, 'bash', allowed)).toBe(false);
      const redirected = join(tmpdir(), 'botharness-memory-redirect-' + Date.now());
      symlinkSync(memory, redirected);
      try {
        state.memoryDirFor.mockReturnValue(redirected);
        const symlinked = { id: 'botharness-orchestrator', header: { cwd: redirected } } as never;
        expect(isSafeMemoryDirectoryListing(state.core, symlinked, 'bash', allowed)).toBe(false);
      } finally {
        rmSync(redirected);
      }
    } finally {
      rmSync(memory, { recursive: true, force: true });
    }
  });

  it('lets only the Orchestrator reach the native Human-question answerer', () => {
    const state = fixture();
    const orchestrator = { id: 'botharness-orchestrator', header: { cwd: '/tmp/memory' } } as never;
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

  it('lets a registered host-owned tool through the unconfined-native gate', () => {
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
    ).toContain('unconfined native tool');
  });

  it('denies per-tool sandbox escalation even when standing policy remains safe', () => {
    const state = fixture();
    expect(
      grantToolExecutionDenial(state.core, state.assignment, state.policy, state.approval, 'bash', {
        command: 'touch /outside',
        sandbox_permissions: 'danger-full-access',
        justification: 'retry',
      }),
    ).toMatch(/cannot request sandbox permission escalation/);
    expect(
      grantToolExecutionDenial(state.core, state.assignment, state.policy, state.approval, 'bash', {
        command: 'pwd',
      }),
    ).toMatch(/unconfined native tool/);
    expect(
      grantToolExecutionDenial(
        state.core,
        state.assignment,
        state.policy,
        state.approval,
        'bash',
        { command: 'pwd' },
        true,
      ),
    ).toBeUndefined();
    state.requireActive.mockImplementation(() => {
      throw new Error('revoked');
    });
    expect(
      grantToolExecutionDenial(
        state.core,
        state.assignment,
        state.policy,
        state.approval,
        'bash',
        { command: 'pwd' },
        true,
      ),
    ).toMatch(/revoked/);
  });
  it('keeps DSH native file tools and denies unconfined execution capabilities', () => {
    const state = fixture();
    for (const name of ['bash', 'terminal', 'run_code', 'create_subagent']) {
      expect(
        grantToolExecutionDenial(
          state.core,
          state.assignment,
          state.policy,
          state.approval,
          name,
          {},
        ),
      ).toMatch(/unconfined native tool/);
    }
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
    const orchestrator = { id: 'botharness-orchestrator', header: { cwd: '/tmp/memory' } } as never;
    expect(grantExecutionDenial(state.core, orchestrator, state.policy, state.approval)).toMatch(
      /workspace-write/,
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
});
