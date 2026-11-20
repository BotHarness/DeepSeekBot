import type {
  HumanAttentionCategory,
  WireAttentionDismissal,
  WireHumanAssignmentContext,
  WireHumanAttentionItem,
  WireHumanAttentionPage,
  WireTeamMode,
} from '@botharness/host-protocol/wire';
import { isApprovalCard } from './approval-readers';
import {
  answer,
  count,
  HostAnswerInvalid,
  optional,
  record,
  strings,
  text,
  type HostCall,
} from './host-answer';

const categories: ReadonlySet<unknown> = new Set<HumanAttentionCategory>([
  'action',
  'info',
  'unread',
  'replies',
  'handled',
]);
const kinds: ReadonlySet<unknown> = new Set<WireHumanAttentionItem['kind']>([
  'group-join-request',
  'pairing-request',
  'user-question',
  'private-input',
  'takeover-request',
  'tool-approval',
  'auto-rejection',
  'workspace-grant-request',
  'bot-dm-message',
  'assignment-waiting-human',
  'assignment-blocked',
  'assignment-report',
  'bot-message-needs-repair',
  'channel-unread',
  'channel-reply',
  'channel-mention',
]);
const handledKinds: ReadonlySet<unknown> = new Set([
  'user-question',
  'tool-approval',
  'workspace-grant-request',
  'assignment-waiting-human',
  'assignment-blocked',
]);
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const hasText = (row: Record<string, unknown>, keys: string[]) =>
  keys.every((key) => text(row[key]));

function isAttentionItem(value: unknown, notifications: boolean): value is WireHumanAttentionItem {
  const row = record(value);
  if (
    !row ||
    !hasText(row, ['id', 'createdAt', 'botSlug', 'summary']) ||
    !categories.has(row['category']) ||
    !kinds.has(row['kind'])
  )
    return false;
  if (
    ![
      'channelId',
      'channelName',
      'messageId',
      'requestId',
      'assignmentSessionId',
      'sourceEventId',
      'responseMessageId',
      'responseSourceEventId',
      'snoozedUntil',
    ].every((key) => optional(row[key], text)) ||
    !optional(row['unreadCount'], count) ||
    !optional(row['isUnread'], isBoolean) ||
    !optional(row['approval'], isApprovalCard) ||
    !optional(row['author'], (value) => {
      const author = record(value);
      return (
        author?.['kind'] === 'bot' && text(author['slug']) && optional(author['displayName'], text)
      );
    })
  )
    return false;
  const category = row['category'];
  const kind = row['kind'];
  const assignment =
    kind === 'assignment-waiting-human' ||
    kind === 'assignment-blocked' ||
    kind === 'assignment-report';
  if (
    assignment
      ? !text(row['assignmentSessionId'])
      : !text(row['channelId']) || (!notifications && !text(row['channelName']))
  )
    return false;
  if (
    (kind === 'assignment-report' || kind === 'bot-message-needs-repair') &&
    !text(row['sourceEventId'])
  )
    return false;
  if (kind === 'pairing-request' && !text(row['requestId'])) return false;
  if (
    (kind === 'auto-rejection' || kind === 'private-input' || kind === 'takeover-request') &&
    (category !== 'action' || !hasText(row, ['messageId', 'sourceEventId']))
  )
    return false;
  if (row['autoRejection'] !== undefined) {
    const detail = record(row['autoRejection']);
    if (
      kind !== 'auto-rejection' ||
      !detail ||
      !hasText(detail, ['sessionId', 'toolName', 'input', 'template', 'reason'])
    )
      return false;
  }
  if (
    kind === 'channel-unread' &&
    (!count(row['unreadCount']) || row['unreadCount'] < 1 || !text(row['messageId']))
  )
    return false;
  const reply = kind === 'channel-reply' || kind === 'channel-mention';
  if (
    (reply || category === 'replies') &&
    (!reply ||
      category !== 'replies' ||
      !hasText(row, ['messageId', 'sourceEventId']) ||
      !isBoolean(row['isUnread']))
  )
    return false;
  return (
    category !== 'handled' ||
    (handledKinds.has(kind) &&
      hasText(row, ['channelId', 'sourceEventId', 'responseMessageId', 'responseSourceEventId']) &&
      (assignment || text(row['messageId'])))
  );
}

function isAttentionPage(value: unknown): value is WireHumanAttentionPage {
  const page = record(value);
  return (
    Array.isArray(page?.['items']) &&
    page['items'].every((item: unknown) =>
      isAttentionItem(item, page['notificationVersion'] === 1),
    ) &&
    optional(page['nextCursor'], text) &&
    optional(page['queryVersion'], (version) => version === 1) &&
    optional(page['notificationVersion'], (version) => version === 1) &&
    optional(page['dismissed'], isBoolean)
  );
}

export function parseHumanAttentionPage(value: unknown): WireHumanAttentionPage {
  return answer(value, isAttentionPage, 'humanAttention');
}

export async function readHumanAttention(
  host: HostCall,
  args: Record<string, unknown>,
): Promise<WireHumanAttentionPage> {
  return parseHumanAttentionPage(await host.call('humanAttention', args));
}

function isDismissal(value: unknown): value is WireAttentionDismissal {
  const row = record(value);
  return (
    row?.['accepted'] === true &&
    count(row['dismissed']) &&
    count(row['read']) &&
    isBoolean(row['more'])
  );
}

export async function dismissHumanAttention(
  host: HostCall,
  args: Record<string, unknown>,
): Promise<WireAttentionDismissal> {
  return answer(
    await host.call('humanAttentionDismissAll', args),
    isDismissal,
    'humanAttentionDismissAll',
  );
}

function isAssignmentContext(value: unknown): value is WireHumanAssignmentContext {
  const context = record(value);
  return (
    context !== undefined &&
    hasText(context, [
      'botSlug',
      'sessionId',
      'sourceEventId',
      'title',
      'description',
      'purpose',
    ]) &&
    isBoolean(context['canReply']) &&
    optional(context['hasOlder'], isBoolean) &&
    optional(context['hasNewer'], isBoolean) &&
    Array.isArray(context['reports']) &&
    context['reports'].length <= 5 &&
    context['reports'].every((value: unknown) => {
      const report = record(value);
      const state = report?.['state'];
      return (
        report !== undefined &&
        hasText(report, ['sourceEventId', 'summary', 'at']) &&
        (state === 'progress' ||
          state === 'completed' ||
          state === 'blocked' ||
          state === 'waiting-human' ||
          state === 'failed')
      );
    }) &&
    optional(context['reply'], (value) => {
      const reply = record(value);
      return reply !== undefined && hasText(reply, ['id', 'at', 'body']);
    })
  );
}

export async function readHumanAssignmentContext(
  host: HostCall,
  args: {
    slug: string;
    sessionId: string;
    sourceEventId: string;
  },
): Promise<{ context: WireHumanAssignmentContext }> {
  const context = record(await host.call('humanAssignmentContext', args))?.['context'];
  if (
    !isAssignmentContext(context) ||
    context.botSlug !== args.slug ||
    context.sessionId !== args.sessionId ||
    context.sourceEventId !== args.sourceEventId ||
    !context.reports.some((report) => report.sourceEventId === args.sourceEventId)
  )
    throw new HostAnswerInvalid('humanAssignmentContext returned an invalid Assignment context.');
  return { context };
}

function isTeamMode(value: unknown): value is WireTeamMode {
  const row = record(value);
  const viewer = record(row?.['viewer']);
  const models = record(viewer?.['models']);
  return (
    row !== undefined &&
    viewer !== undefined &&
    (row['isolation'] === 'trial' || row['isolation'] === 'enforced') &&
    ['enabled', 'ownerPasswordSet', 'insecureHttpAllowed'].every((key) => isBoolean(row[key])) &&
    count(row['activeMembers']) &&
    optional(row['suspendedMembers'], count) &&
    optional(row['privateAccessNotice'], (value) => value === true) &&
    strings(row['memberUrls']) &&
    optional(row['confinement'], (value) => {
      const confinement = record(value);
      const enforcement = confinement?.['enforcement'];
      return (
        confinement !== undefined &&
        (enforcement === 'full' || enforcement === 'partial' || enforcement === 'unavailable') &&
        isBoolean(confinement['filesystem']) &&
        isBoolean(confinement['network']) &&
        strings(confinement['missing'])
      );
    }) &&
    (viewer['kind'] === 'owner' || viewer['kind'] === 'member') &&
    hasText(viewer, ['humanId', 'displayName']) &&
    isBoolean(viewer['mustChangePassword']) &&
    isBoolean(viewer['owner']) &&
    strings(viewer['permissions']) &&
    strings(viewer['roleIds']) &&
    (models?.['all'] === true ||
      (models?.['all'] === false && strings(models['providers']) && strings(models['routes'])))
  );
}

export async function readTeamMode(host: HostCall): Promise<WireTeamMode> {
  return answer(await host.call('teamMode', {}), isTeamMode, 'teamMode');
}
