import { cliEffects, brokerCliEffects } from '../bots/cli-effects.js';
import { requiresHumanDecision } from './approval-templates.js';

import type { ToolEffects } from './tool-effects-contract.js';
export type { ToolEffects } from './tool-effects-contract.js';

type Declaration = ToolEffects & {
  readonly approval: 'native' | 'existing' | 'always' | 'attachment';
};
const read: Declaration = {
  changes: 'none',
  reach: 'local',
  personalData: true,
  approval: 'existing',
};
const write: Declaration = { ...read, changes: 'reversible' };
const send: Declaration = { ...read, changes: 'irreversible', reach: 'external' };
const secret: Declaration = { ...send, secrets: true, approval: 'always' };
const browserRead: Declaration = { ...read, reach: 'external', approval: 'native' };
const browserAct: Declaration = { ...send, approval: 'native' };
const computerRead: Declaration = { ...read, approval: 'native' };
const computerAct: Declaration = { ...send, approval: 'native' };

export const FIRST_PARTY_TOOL_EFFECTS = {
  deepseekbot_cli: write,
  archive_assignment: write,
  ask_secret: { ...write, secrets: true },
  ask_user_question: write,
  bot_create: { ...write, approval: 'always' },
  bot_schedule_create: write,
  bot_schedule_delete: { ...write, changes: 'irreversible' },
  bot_schedule_list: read,
  bot_schedule_update: write,
  bot_send_message: send,
  bot_subagent: send,
  bot_subagent_fork: send,
  bridge_attachment_save: { ...write, reach: 'workspace' },
  bridge_context: read,
  bridge_directory: read,
  bridge_group_policy_list: read,
  bridge_group_policy_set: { ...write, authority: 'management' },
  bridge_outbox: read,
  bridge_reachable_groups: read,
  bridge_read: read,
  bridge_sender_permissions: read,
  bridge_share: send,
  bridge_targets: read,
  bridge_thread_policy_list: read,
  bridge_thread_policy_set: { ...write, authority: 'management' },
  browser_click: browserAct,
  browser_observe: browserRead,
  browser_open: browserAct,
  browser_press_key: browserAct,
  browser_screenshot: browserRead,
  browser_scroll: browserAct,
  browser_tabs: browserAct,
  browser_type: browserAct,
  browser_upload: browserAct,
  browser_wait: browserRead,
  call_frame: read,
  channel_action: send,
  channel_attachment_import: { ...write, reach: 'workspace' },
  channel_attachment_open: { ...write, approval: 'attachment' },
  channel_attachment_save: { ...write, reach: 'workspace' },
  channel_list: read,
  channel_read: read,
  channel_read_image: read,
  cloud_work: send,
  computer_click: computerAct,
  computer_get_desktop_state: computerRead,
  computer_get_window_state: computerRead,
  computer_hotkey: computerAct,
  computer_launch_app: computerAct,
  computer_list_windows: computerRead,
  computer_press_key: computerAct,
  computer_scroll: computerAct,
  computer_type_text: computerAct,
  computer_verify_state: computerRead,
  create_assignment: send,
  genui_diagram: write,
  genui_preview: write,
  group_attention_get: read,
  group_attention_set: write,
  group_create: write,
  group_invite_bot: write,
  group_invite_respond: write,
  group_join_decide: write,
  group_join_request: write,
  group_leave: write,
  group_remove_member: write,
  group_rename: write,
  inbox_history: read,
  inbox_ignore: write,
  inbox_list: read,
  inbox_resolve: write,
  inbox_snooze: write,
  inspect_assignment: read,
  list_assignment_models: read,
  list_assignments: read,
  list_bot_contacts: read,
  list_bot_subagent_models: read,
  list_subagent_models: read,
  list_workspace_grants: read,
  memory_continue_from_commit: { ...write, reach: 'memory' },
  memory_switch_branch: { ...write, reach: 'memory' },
  protected_cli: { ...secret, approval: 'native' },
  report_to_orchestrator: write,
  request_workspace_grant: write,
  secret_cli: secret,
  secret_http: { ...secret, approval: 'native' },
  secret_mcp_connect: secret,
  secret_mcp_disconnect: { ...write, secrets: true },
  send_assignment_request: send,
  source_attention_get: read,
  source_attention_reset: write,
  source_attention_set: write,
  speaker_policy: read,
  stop_assignment: { ...write, changes: 'irreversible' },
  subagent: send,
  subagent_fork: send,
  takeover_cancel: write,
  takeover_list: read,
  takeover_request: write,
  todos_add: { ...write, approval: 'native' },
  todos_list: { ...read, approval: 'native' },
  todos_remove: { ...write, approval: 'native' },
  todos_update: { ...write, approval: 'native' },
  unarchive_assignment: write,
  wait_for_assignment: read,
} satisfies Record<string, Declaration>;

const declarations: Readonly<Partial<Record<string, Declaration>>> = FIRST_PARTY_TOOL_EFFECTS;
function declaration(name: string): Declaration | undefined {
  return Object.hasOwn(declarations, name) ? declarations[name] : undefined;
}
function inputText(args: unknown): string {
  try {
    return JSON.stringify(args) ?? '';
  } catch {
    return '';
  }
}

export function toolEffects(name: string, args: unknown): ToolEffects | undefined {
  if (name === 'deepseekbot_cli') {
    if (
      typeof args !== 'object' ||
      args === null ||
      !('argv' in args) ||
      !Array.isArray(args.argv) ||
      !args.argv.every((arg): arg is string => typeof arg === 'string')
    )
      return undefined;
    return cliEffects(args.argv);
  }
  if (name.startsWith('deepseekbot ')) return brokerCliEffects(name, args);
  const declared = declaration(name);
  if (!declared) return undefined;
  const { approval: _approval, ...effects } = declared;
  const operation = typeof args === 'object' && args !== null ? args : undefined;
  if (
    name === 'bridge_context' &&
    operation &&
    'scope' in operation &&
    (operation.scope === 'group' || operation.scope === 'nearby' || operation.scope === 'thread')
  )
    return { ...effects, reach: 'external' };
  if (
    name === 'unarchive_assignment' &&
    operation &&
    'message' in operation &&
    typeof operation.message === 'string' &&
    operation.message.trim() !== ''
  )
    return { ...effects, changes: 'irreversible', reach: 'external' };
  if (
    name === 'secret_http' &&
    operation &&
    'method' in operation &&
    typeof operation.method === 'string' &&
    operation.method.toUpperCase() === 'GET'
  )
    return { ...effects, changes: 'none' };
  if (name === 'browser_tabs' && operation && 'action' in operation && operation.action === 'close')
    return { ...effects, reach: 'local' };
  if (
    declared.approval === 'attachment' &&
    operation &&
    'access' in operation &&
    operation.access === 'read'
  )
    return { ...effects, changes: 'none' };
  if (
    (name === 'cloud_work' &&
      operation &&
      'operation' in operation &&
      operation.operation === 'inspect') ||
    (name === 'channel_action' &&
      operation &&
      'action' in operation &&
      operation.action === 'inspect') ||
    (name === 'browser_tabs' && operation && 'action' in operation && operation.action === 'list')
  )
    return { ...effects, changes: 'none', reach: 'local' };
  if (
    name === 'browser_tabs' &&
    operation &&
    'action' in operation &&
    operation.action === 'select'
  )
    return { ...effects, changes: 'reversible', reach: 'local' };
  if (
    name === 'channel_action' &&
    operation &&
    'action' in operation &&
    operation.action === 'drop'
  )
    return { ...effects, changes: 'reversible', reach: 'local' };
  return effects;
}

export type ToolApprovalContext =
  | {
      readonly stage: 'admission';
      readonly admission: Declaration['approval'];
      readonly legacyProtected: boolean;
    }
  | {
      readonly stage: 'request';
      readonly fullAccess: boolean;
      readonly eachUse: boolean;
      readonly explicitApproval: boolean;
      readonly legacyProtected: boolean;
      readonly device: boolean;
      readonly standingRule: 'none' | 'ordinary' | 'explicit';
      readonly reviewer: boolean;
      readonly rememberable: boolean;
    };

export interface ToolApprovalPath {
  readonly path: 'native' | 'request' | 'full-access' | 'standing-rule' | 'reviewer' | 'human';
  readonly rememberable: boolean;
  readonly explicitRule: boolean;
  readonly reason:
    | 'undeclared-native'
    | 'existing-native'
    | 'effect-approval'
    | 'protected-operation'
    | 'full-access-existing'
    | 'saved-authorization'
    | 'template-review'
    | 'human-required';
}

export function hasIrreversibleExternalEffect(effects: ToolEffects | undefined): boolean {
  return effects?.changes === 'irreversible' && effects.reach === 'external';
}

export function decideToolApproval(
  effects: ToolEffects | undefined,
  context: ToolApprovalContext,
): ToolApprovalPath {
  if (context.stage === 'admission') {
    const management = context.legacyProtected || effects?.authority === 'management';
    const required =
      hasIrreversibleExternalEffect(effects) ||
      effects?.authority === 'management' ||
      context.admission === 'always' ||
      (context.admission === 'attachment' && effects?.changes !== 'none') ||
      context.legacyProtected;
    return {
      path: required ? 'request' : 'native',
      rememberable: true,
      explicitRule: management,
      reason: management
        ? 'protected-operation'
        : required
          ? 'effect-approval'
          : effects
            ? 'existing-native'
            : 'undeclared-native',
    };
  }
  const explicit =
    context.legacyProtected || context.explicitApproval || effects?.authority === 'management';
  const explicitRule = explicit || context.device;
  const rememberable = !context.eachUse || context.rememberable;
  if (
    !explicit &&
    !hasIrreversibleExternalEffect(effects) &&
    !context.eachUse &&
    context.fullAccess
  )
    return { path: 'full-access', rememberable, explicitRule, reason: 'full-access-existing' };
  if (
    !context.eachUse &&
    (context.standingRule === 'explicit' || (!explicitRule && context.standingRule === 'ordinary'))
  )
    return { path: 'standing-rule', rememberable, explicitRule, reason: 'saved-authorization' };
  if (!explicit && context.reviewer)
    return { path: 'reviewer', rememberable, explicitRule, reason: 'template-review' };
  return {
    path: 'human',
    rememberable,
    explicitRule,
    reason: explicit ? 'protected-operation' : 'human-required',
  };
}

export function toolApprovalRequired(
  name: string,
  args: unknown,
  governed: boolean,
  templateInUse?: (name: string) => boolean,
): boolean {
  return (
    decideToolApproval(toolEffects(name, args), {
      stage: 'admission',
      admission: declaration(name)?.approval ?? 'native',
      legacyProtected: governed && requiresHumanDecision(inputText(args), templateInUse),
    }).path === 'request'
  );
}
