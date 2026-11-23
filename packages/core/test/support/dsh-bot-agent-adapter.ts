import type { AssignmentSummary, OrchestratorAgentRun } from '../../src/runtime/bot-runtime.js';
import { FAKE_BOT as BOT } from '../dsh-agent-host-fixture.js';

export const TOB_GROUP_TOOL_CASES: readonly (readonly [
  name: string,
  args: Readonly<Record<string, string | boolean>>,
  method: string,
])[] = [
  ['group_create', { name: 'Group' }, 'createGroup'],
  ['group_invite_bot', { channel_id: 'group', bot_id: 'peer' }, 'inviteGroup'],
  ['group_invite_respond', { invite_id: 'invite', accept: true }, 'respondToGroupInvite'],
  ['group_join_request', { channel_id: 'group' }, 'requestGroupJoin'],
  [
    'group_join_decide',
    { channel_id: 'group', request_id: 'request', accept: true },
    'decideGroupJoin',
  ],
  ['group_rename', { channel_id: 'group', name: 'Renamed' }, 'renameGroup'],
  ['group_remove_member', { channel_id: 'group', bot_id: 'peer' }, 'removeGroupMember'],
  ['group_leave', { channel_id: 'group' }, 'leaveGroup'],
] as const;

export const TOB_CLI_TOOL_NAMES: string[] = [
  'bot_create',
  ...TOB_GROUP_TOOL_CASES.map(([name]) => name),
];

export const ORCHESTRATOR_TOOL_ORDER: string[] = [
  'genui_diagram',
  'genui_preview',
  'channel_action',
  'bot_send_message',
  'memory_switch_branch',
  'memory_continue_from_commit',
  'list_assignment_models',
  'create_assignment',
  'request_workspace_grant',
  'list_workspace_grants',
  'list_assignments',
  'archive_assignment',
  'unarchive_assignment',
  'inspect_assignment',
  'send_assignment_request',
  'link_message_sessions',
  'wait_for_assignment',
  'stop_assignment',
  'channel_list',
  'channel_read',
  'inbox_history',
  'inbox_list',
  'inbox_resolve',
  'inbox_snooze',
  'inbox_ignore',
  'channel_attachment_open',
  'channel_attachment_save',
  'channel_attachment_import',
  'channel_read_image',
  'call_frame',
  'list_bot_contacts',
  'group_create',
  'bot_create',
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
];

export const ASSIGNMENT: Pick<
  AssignmentSummary,
  'sessionId' | 'title' | 'description' | 'createdAt' | 'updatedAt'
> & {
  activity: 'working';
} = {
  sessionId: 'assignment-1',
  title: '核对发布状态',
  description: '核对发布状态',
  activity: 'working' as const,
  createdAt: '2026-09-17T00:00:00.000Z',
  updatedAt: '2026-09-17T00:00:00.000Z',
};

type GroupTools = {
  list: () => { channels: never[] };
  query: () => { messages: never[] };
  readModel: () => string;
  createGroup: () => never;
  inviteGroup: () => never;
  respondToGroupInvite: () => never;
  renameGroup: () => never;
  removeGroupMember: () => never;
  readGroupWakePolicy: () => never;
  setGroupWakePolicy: () => never;
  leaveGroup: () => never;
};

export const groupTools: GroupTools = {
  list: () => ({ channels: [] }),
  query: () => ({ messages: [] }),
  readModel: () => JSON.stringify({ messages: [] }),
  createGroup: (): never => {
    throw new Error('unexpected Group creation');
  },
  inviteGroup: (): never => {
    throw new Error('unexpected Group invitation');
  },
  respondToGroupInvite: (): never => {
    throw new Error('unexpected Group response');
  },
  renameGroup: (): never => {
    throw new Error('unexpected Group rename');
  },
  removeGroupMember: (): never => {
    throw new Error('unexpected Group removal');
  },
  readGroupWakePolicy: (): never => {
    throw new Error('unexpected Group wake policy read');
  },
  setGroupWakePolicy: (): never => {
    throw new Error('unexpected Group wake policy write');
  },
  leaveGroup: (): never => {
    throw new Error('unexpected Group leave');
  },
};

export const reportRun: OrchestratorAgentRun = {
  sessionId: 'orchestrator-ada',
  resume: false,
  bot: BOT,
  message: 'Write a long report',
  inboundChannelId: 'dm-test',
  inbox: '',
  channels: {
    ...groupTools,
    contacts: async () => ({ outputLimit: 12_000, contacts: [] }),
    sendToBot: async () => {
      throw new Error('unexpected Bot DM');
    },
    ignore: () => ({ sourceEventId: 'source-1', ignoredAt: BOT.createdAt, alreadyIgnored: false }),
    read: () => [],
    requestGrant: async () => {
      throw new Error('unexpected Grant request');
    },
    send: async (input) => ({
      id: 'bot-1',
      at: BOT.createdAt,
      author: { kind: 'bot', slug: BOT.slug },
      body: input.body,
    }),
  },
  assignments: {
    create: () => {
      throw new Error('unexpected Assignment');
    },
    request: () => {
      throw new Error('unexpected Assignment request');
    },
    grants: () => [],
    list: () => [],
    inspect: () => undefined,
    stop: async () => {
      throw new Error('unexpected stop');
    },
  },
};
