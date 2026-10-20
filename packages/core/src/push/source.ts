import { dmChannelId } from '../channels/channel.js';
import type { HumanAttentionItem, HumanAttentionQuery } from '../runtime/human-attention.js';
import type { PushCandidate, PushKind, PushSource } from './delivery.js';

const KIND: Partial<Record<HumanAttentionItem['kind'], PushKind>> = {
  'tool-approval': 'approval',
  'workspace-grant-request': 'approval',
  'auto-rejection': 'approval',
  'group-join-request': 'approval',
  'assignment-waiting-human': 'question',
  'assignment-blocked': 'question',
  'user-question': 'question',
  'private-input': 'private-input',
  'channel-reply': 'reply',
  'channel-mention': 'reply',
};

const ACTION_LIMIT = 100;
const REPLY_LIMIT = 30;
const PREVIEW_LIMIT = 140;
const PREVIEW_FIELDS = ['command', 'cmd', 'script', 'code', 'url', 'path', 'file_path'];

export interface PushApprovalLookup {
  (
    channelId: string,
    messageId: string,
  ): { toolName: string; input: string; allowAlways?: boolean } | undefined;
}

function clip(text: string): string | undefined {
  const flat = text.replace(/\s+/gu, ' ').trim();
  if (flat === '') return undefined;
  return flat.length <= PREVIEW_LIMIT ? flat : `${flat.slice(0, PREVIEW_LIMIT - 1).trimEnd()}…`;
}

function inputPreview(input: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return input;
  }
  if (typeof parsed === 'string') return parsed;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return input;
  const fields = parsed as Record<string, unknown>;
  const value =
    fields[PREVIEW_FIELDS.find((field) => field in fields) ?? Object.keys(fields)[0] ?? ''];
  return value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);
}

const ONCE_ONLY_TOOLS = new Set(['secret_cli']);

function approvalOf(
  item: HumanAttentionItem,
  approval: PushApprovalLookup | undefined,
): { preview?: string; categoryId: string } {
  const request =
    item.channelId === undefined || item.messageId === undefined
      ? undefined
      : approval?.(item.channelId, item.messageId);
  if (request === undefined) return { categoryId: 'tool-approval-once' };
  const shown = inputPreview(request.input);
  const preview = clip(shown.trim() === '' ? request.toolName : `${request.toolName} · ${shown}`);
  return {
    ...(preview === undefined ? {} : { preview }),
    categoryId:
      request.allowAlways === true && !ONCE_ONLY_TOOLS.has(request.toolName)
        ? 'tool-approval'
        : 'tool-approval-once',
  };
}

function details(
  item: HumanAttentionItem,
  kind: PushKind,
  approval: PushApprovalLookup | undefined,
): { preview?: string; categoryId?: string } {
  if (kind === 'private-input') return {};
  if (kind === 'approval' && item.kind === 'tool-approval') return approvalOf(item, approval);
  const preview = clip(item.summary);
  return preview === undefined ? {} : { preview };
}

function candidate(
  item: HumanAttentionItem,
  approval: PushApprovalLookup | undefined,
): PushCandidate[] {
  const kind = KIND[item.kind];
  if (kind === undefined || item.botSlug === '') return [];
  const channelName =
    item.channelId === dmChannelId(item.botSlug) ? undefined : item.channelName?.trim();
  return [
    {
      id: item.id,
      kind,
      attentionKind: item.kind,
      botSlug: item.botSlug,
      createdAt: item.createdAt,
      ...(item.channelId === undefined ? {} : { channelId: item.channelId }),
      ...(item.messageId === undefined ? {} : { messageId: item.messageId }),
      ...(channelName === undefined || channelName === '' ? {} : { channelName }),
      ...details(item, kind, approval),
    },
  ];
}

export function humanInboxPushSource(
  attention: Pick<HumanAttentionQuery, 'list' | 'actionCount' | 'dmReplies'>,
  botName: (slug: string) => string | undefined,
  approval?: PushApprovalLookup,
): PushSource {
  return {
    pending() {
      const action = attention.list({ category: 'action', limit: ACTION_LIMIT }).items;
      const replies = attention
        .list({ category: 'replies', limit: REPLY_LIMIT })
        .items.filter((item) => item.isUnread !== false);
      const dms = attention.dmReplies(REPLY_LIMIT);
      return {
        items: [...action, ...replies, ...dms].flatMap((item) => candidate(item, approval)),
        badge: attention.actionCount(),
      };
    },
    botName,
  };
}
