import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Session } from '@deepseek-ai/dsh-session';
import type { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy';
import type { ApprovalService } from '@deepseek-ai/dsh-user-approval';

import type { BotHarnessCore } from '../plugin.js';
import { NATIVE_FILE_TOOL_NAMES, nativeFileToolDenial } from './grant-native-tools.js';

export function grantExecutionDenial(
  core: Pick<BotHarnessCore, 'ownership' | 'runtime' | 'grants' | 'registry'>,
  session: Session,
  policy: SandboxPolicyService | undefined,
  approval: ApprovalService | undefined,
): string | undefined {
  let owner = core.ownership.resolve(session.id);
  if (owner === undefined) {
    const parent = session.header.parentSession;
    return session.id.startsWith('botharness-') ||
      (parent !== undefined && core.ownership.resolve(parent) !== undefined)
      ? 'BotHarness Session has no durable owner'
      : undefined;
  }
  if (core.registry.get(owner.botSlug) === undefined)
    return 'PersonaBot identity is deleted or unavailable';
  const delegatedSubagent = owner.provenance === 'subagent';
  const seen = new Set<string>();
  while (owner.parentSessionId !== undefined) {
    if (seen.has(owner.sessionId)) return 'BotHarness Session ownership is cyclic';
    seen.add(owner.sessionId);
    const parent = core.ownership.resolve(owner.parentSessionId);
    if (parent === undefined || parent.botSlug !== owner.botSlug) {
      return 'BotHarness Session parent ownership is missing or inconsistent';
    }
    owner = parent;
  }
  if (policy === undefined || approval === undefined) {
    return 'DSH permission services are unavailable for BotHarness Session';
  }
  const mode = policy.resolve({ session }).mode;
  const approvalPolicy = approval.overrideOf(session);
  if (owner.rootRole === 'orchestrator') {
    if (mode !== 'workspace-write' || approvalPolicy !== (delegatedSubagent ? 'never' : 'ask')) {
      return delegatedSubagent
        ? 'Orchestrator Subagent requires workspace-write and never approval'
        : 'Orchestrator Session requires workspace-write and ask';
    }
    const memoryCwd = core.registry.memoryDirFor(owner.botSlug);
    return memoryCwd !== undefined && session.header.cwd === memoryCwd
      ? undefined
      : 'Orchestrator Session requires its Memory working directory';
  }
  if (owner.rootRole !== 'assignment') return 'Unknown BotHarness Session role';
  const assignment = core.runtime.getAssignment(owner.botSlug, owner.sessionId);
  const permission = assignment?.permission;
  if (permission === undefined || session.header.cwd !== permission.primaryCwd) {
    return 'Assignment Session permission snapshot is missing or mismatched';
  }
  if (
    mode !== permission.mode ||
    approvalPolicy !== (delegatedSubagent ? 'never' : permission.approval)
  ) {
    return 'Assignment Session permission mode differs from its snapshot';
  }
  try {
    const grant = core.grants.requireActive(owner.botSlug, permission.grantId);
    if (
      grant.workspaceId !== permission.workspaceId ||
      grant.workspacePath !== permission.primaryCwd
    ) {
      return 'Assignment Workspace Grant no longer matches its permission snapshot';
    }
  } catch {
    return 'Assignment Workspace Grant is missing, revoked, or unavailable';
  }
  return undefined;
}

const BOT_TOOL_NAMES = new Set([
  'create_assignment',
  'list_assignment_models',
  'list_bot_subagent_models',
  'bot_subagent',
  'bot_subagent_fork',
  'subagent',
  'subagent_fork',
  'list_subagent_models',
  'request_workspace_grant',
  'list_workspace_grants',
  'list_assignments',
  'inspect_assignment',
  'wait_for_assignment',
  'send_assignment_request',
  'stop_assignment',
  'channel_list',
  'channel_read',
  'bridge_sender_permissions',
  'bridge_targets',
  'bridge_post',
  'bridge_outbox',
  'bridge_read',
  'bridge_share',
  'bridge_reply',
  'bridge_context',
  'bridge_group_policy_list',
  'bridge_group_policy_set',
  'bridge_thread_policy_list',
  'bridge_thread_policy_set',
  'bridge_attachment_save',
  'bridge_reply_file',
  'inbox_ignore',
  'inbox_history',
  'channel_read_image',
  'channel_attachment_save',
  'channel_attachment_import',
  'list_bot_contacts',
  'group_create',
  'group_invite_bot',
  'group_invite_respond',
  'group_join_request',
  'group_join_decide',
  'group_rename',
  'group_remove_member',
  'group_attention_get',
  'group_attention_set',
  'source_attention_get',
  'source_attention_set',
  'source_attention_reset',
  'bot_schedule_list',
  'bot_schedule_create',
  'bot_schedule_update',
  'bot_schedule_delete',
  'group_leave',
  'bot_dm_send',
  'channel_send',

  'ask_user_question',
  'memory_switch_branch',
  'memory_continue_from_commit',
  'report_to_orchestrator',
]);

export function requiresHumanToolApproval(name: string, args?: unknown): boolean {
  if (name === 'channel_attachment_open')
    return (
      typeof args !== 'object' ||
      args === null ||
      (args as Record<string, unknown>).access !== 'read'
    );
  return !BOT_TOOL_NAMES.has(name) && !NATIVE_FILE_TOOL_NAMES.has(name);
}

export function isSafeMemoryDirectoryListing(
  core: Pick<BotHarnessCore, 'ownership' | 'registry'>,
  session: Session,
  name: string,
  args: unknown,
): boolean {
  if (name !== 'bash' || typeof args !== 'object' || args === null) return false;
  const owner = core.ownership.resolve(session.id);
  if (owner?.rootRole !== 'orchestrator') return false;
  const memory = core.registry.memoryDirFor(owner.botSlug);
  if (memory === undefined || session.header.cwd !== memory) return false;
  try {
    if (realpathSync(memory) !== resolve(memory)) return false;
  } catch {
    return false;
  }
  const input = args as Record<string, unknown>;

  return (
    typeof input.command === 'string' &&
    /^(?:ls(?: -la)?|pwd)$/.test(input.command.trim()) &&
    (input.workdir === undefined || input.workdir === '.' || input.workdir === memory) &&
    input.run_in_background !== true &&
    input.sandbox_permissions === undefined &&
    input.justification === undefined
  );
}

export function grantToolExecutionDenial(
  core: Pick<BotHarnessCore, 'ownership' | 'runtime' | 'grants' | 'registry' | 'hostTools'>,
  session: Session,
  policy: SandboxPolicyService | undefined,
  approval: ApprovalService | undefined,
  name: string,
  args: unknown,
  allowedOnce = false,
): string | undefined {
  const denial = grantExecutionDenial(core, session, policy, approval);
  if (denial !== undefined) return denial;
  if (core.ownership.resolve(session.id) === undefined) return undefined;
  if (typeof args === 'object' && args !== null && 'sandbox_permissions' in args) {
    return 'BotHarness Session cannot request sandbox permission escalation';
  }
  if (
    name === 'ask_user_question' &&
    core.ownership.resolve(session.id)?.rootRole !== 'orchestrator'
  )
    return 'Assignment questions must go through the Orchestrator';
  if (name === 'channel_attachment_open')
    return !requiresHumanToolApproval(name, args) || allowedOnce
      ? undefined
      : 'Original attachment edit access requires Human approval';
  if (BOT_TOOL_NAMES.has(name)) return undefined;

  if (core.hostTools.has(name)) return undefined;
  const owner = core.ownership.resolve(session.id);
  if (
    owner?.rootRole === 'assignment' &&
    core.runtime.getAssignment(owner.botSlug, owner.sessionId)?.permission?.mode ===
      'danger-full-access'
  )
    return undefined;
  if (NATIVE_FILE_TOOL_NAMES.has(name)) return nativeFileToolDenial(core, session, name, args);
  if (isSafeMemoryDirectoryListing(core, session, name, args)) return undefined;
  if (allowedOnce) return undefined;
  return 'BotHarness Session cannot run an unconfined native tool: ' + name;
}
