import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
import { dmChannelId } from '../channels/channel.js';
import type { HumanAttentionItem, HumanAttentionQuery } from '../runtime/human-attention.js';
import type { PushCandidate, PushKind, PushSource } from './delivery.js';
import { toolInputPreview } from '../runtime/tool-input-preview.js';
import { NATIVE_SESSION_ATTENTION_KIND } from '@botharness/host-protocol/wire';

const KIND: Partial<Record<HumanAttentionItem['kind'], PushKind>> = {
  'tool-approval': 'approval',
  'workspace-grant-request': 'approval',
  'auto-rejection': 'approval',
  'group-join-request': 'approval',
  'pairing-request': 'approval',
  'assignment-waiting-human': 'question',
  'assignment-blocked': 'question',
  'user-question': 'question',
  'private-input': 'private-input',
  'takeover-request': 'question',
  'channel-reply': 'reply',
  'channel-mention': 'reply',
};

function nativeCandidate(item: HumanAttentionItem): PushCandidate[] {
  const native = item.nativeSession;
  if (native === undefined) return [];
  const preview = clip(item.summary);
  return [
    {
      id: item.id,
      kind: native.input === 'approval' ? 'approval' : 'question',
      attentionKind: item.kind,
      botSlug: '',
      createdAt: item.createdAt,
      session: {
        sessionId: native.sessionId,
        ...(native.sessionTitle === undefined ? {} : { title: native.sessionTitle }),
      },
      ...(preview === undefined ? {} : { preview }),
    },
  ];
}

const ACTION_LIMIT = 100;
const REPLY_LIMIT = 200;
const PAGE_LIMIT = 100;
const PREVIEW_LIMIT = 140;

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

function approvalOf(
  item: HumanAttentionItem,
  approval: PushApprovalLookup | undefined,
): { preview?: string; categoryId?: string } {
  const request =
    item.channelId === undefined || item.messageId === undefined
      ? undefined
      : approval?.(item.channelId, item.messageId);
  const readOnly = item.approval?.masked === false && item.approval.canDecide === false;
  if (request === undefined) return readOnly ? {} : { categoryId: 'tool-approval-once' };
  const shown = toolInputPreview(request.input);
  const preview = clip(shown.trim() === '' ? request.toolName : `${request.toolName} · ${shown}`);
  return {
    ...(preview === undefined ? {} : { preview }),
    ...(readOnly
      ? {}
      : { categoryId: request.allowAlways === true ? 'tool-approval' : 'tool-approval-once' }),
  };
}

function details(
  item: HumanAttentionItem,
  kind: PushKind,
  approval: PushApprovalLookup | undefined,
): { preview?: string; categoryId?: string } {
  if (item.approval?.masked || kind === 'private-input') return {};
  if (kind === 'approval' && item.kind === 'tool-approval') return approvalOf(item, approval);
  const preview = clip(item.summary);
  return preview === undefined ? {} : { preview };
}

function candidate(
  item: HumanAttentionItem,
  approval: PushApprovalLookup | undefined,
): PushCandidate[] {
  if (item.kind === NATIVE_SESSION_ATTENTION_KIND) return nativeCandidate(item);
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
      ...(item.author ? { author: item.author } : {}),
      ...(item.approval ? { approval: item.approval } : {}),
      ...(item.channelId === undefined ? {} : { channelId: item.channelId }),
      ...(item.messageId === undefined ? {} : { messageId: item.messageId }),
      ...(channelName === undefined || channelName === '' ? {} : { channelName }),
      ...details(item, kind, approval),
    },
  ];
}

function unreadReplies(
  attention: Pick<HumanAttentionQuery, 'list'>,
  human: HumanContext,
): HumanAttentionItem[] {
  const items: HumanAttentionItem[] = [];
  let cursor: string | undefined;
  do {
    const page = attention.list(human, {
      category: 'replies',
      unreadOnly: true,
      limit: Math.min(PAGE_LIMIT, REPLY_LIMIT - items.length),
      ...(cursor === undefined ? {} : { cursor }),
    });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== undefined && items.length < REPLY_LIMIT);
  return items;
}

export function activityListPushSource(
  attention: Pick<HumanAttentionQuery, 'list' | 'actionCount' | 'dmReplies'>,
  botName: (slug: string) => string | undefined,
  approval?: PushApprovalLookup,
): PushSource {
  return {
    pending(human = OWNER_HUMAN_CONTEXT) {
      const action = attention.list(human, {
        category: 'action',
        limit: ACTION_LIMIT,
        source: 'all',
      }).items;
      const native = action.filter((item) => item.kind === NATIVE_SESSION_ATTENTION_KIND).length;
      const replies = unreadReplies(attention, human).filter((item) => item.isUnread !== false);
      const dms = attention.dmReplies(human, REPLY_LIMIT);
      return {
        items: [...action, ...replies, ...dms].flatMap((item) => candidate(item, approval)),
        badge: attention.actionCount(human) + native,
      };
    },
    botName,
  };
}
