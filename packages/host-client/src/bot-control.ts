import { readAdministrativeBot } from './bot-administration';
import type {
  BotInboxState,
  WireAdministrativeBot,
  WireBotAttentionItem,
  WireBotAttentionPage,
  WireBotCompactResult,
  WireSessionStopResult,
  WireStoppedSessionRef,
} from '@botharness/host-protocol/wire';
import { readChangedBot, type ChangedBotAnswer } from './bots';
import {
  answer,
  count,
  finiteNumber,
  HostAnswerInvalid,
  optional,
  record,
  text,
  type HostCall,
} from './host-answer';

const attentionStates: ReadonlySet<unknown> = new Set<BotInboxState>([
  'pending',
  'processing',
  'observed',
  'deferred',
  'needs-repair',
  'open',
  'snoozed',
  'handled',
  'ignored',
]);
const reportStates: ReadonlySet<unknown> = new Set<WireBotAttentionItem['assignmentReportState']>([
  'progress',
  'completed',
  'blocked',
  'waiting-human',
  'failed',
]);
const authors: ReadonlySet<unknown> = new Set<WireBotAttentionItem['authorKind']>([
  'human',
  'bot',
  'bridged',
  'system',
]);

function isOrigin(value: unknown): boolean {
  const row = record(value);
  if (
    !row ||
    !['platform', 'accountName', 'conversationName', 'conversationId', 'senderId'].every((key) =>
      text(row[key]),
    ) ||
    !optional(row['senderName'], text)
  )
    return false;
  if (row['voice'] === undefined) return true;
  const voice = record(row['voice']);
  return (
    voice !== undefined &&
    (voice['transcript'] === 'platform' || voice['transcript'] === 'unavailable') &&
    optional(voice['itemId'], text) &&
    ['durationMs', 'encodeType', 'sampleRate', 'bitsPerSample'].every((key) =>
      optional(voice[key], finiteNumber),
    )
  );
}

function isAttentionItem(value: unknown): value is WireBotAttentionItem {
  const row = record(value);
  return (
    row !== undefined &&
    ['id', 'botSlug', 'reason', 'createdAt', 'sourceKind', 'summary'].every((key) =>
      text(row[key]),
    ) &&
    attentionStates.has(row['state']) &&
    authors.has(row['authorKind']) &&
    typeof row['sourceAvailable'] === 'boolean' &&
    [
      'observedAt',
      'handledAt',
      'ignoredAt',
      'resolutionNote',
      'snoozedUntil',
      'snoozeNote',
      'sourceChannelId',
      'sourceChannelName',
      'sourceMessageId',
      'assignmentSessionId',
      'assignmentTitle',
      'relatedReportSourceEventId',
      'scheduleId',
      'authorBotSlug',
    ].every((key) => optional(row[key], text)) &&
    optional(row['assignmentTurn'], count) &&
    optional(row['assignmentReportState'], (state) => reportStates.has(state)) &&
    optional(row['externalOrigin'], isOrigin)
  );
}

function isAttentionPage(value: unknown): value is WireBotAttentionPage {
  const row = record(value);
  return (
    Array.isArray(row?.['items']) &&
    row['items'].every(isAttentionItem) &&
    optional(row['nextCursor'], text)
  );
}

export async function readBotAttention(
  host: HostCall,
  args: Record<string, unknown>,
): Promise<WireBotAttentionPage> {
  return answer(await host.call('botAttention', args), isAttentionPage, 'botAttention');
}

type BotAvatarArgs = { channelId: string; avatar: unknown };
type AdministrativeAvatarReceipt = { metadataOnly: true; bot: WireAdministrativeBot };

export function setBotAvatar(host: HostCall, args: BotAvatarArgs): Promise<ChangedBotAnswer>;
export function setBotAvatar(
  host: HostCall,
  args: BotAvatarArgs,
  allowMetadata: true,
): Promise<ChangedBotAnswer | AdministrativeAvatarReceipt>;
export async function setBotAvatar(
  host: HostCall,
  args: BotAvatarArgs,
  allowMetadata = false,
): Promise<ChangedBotAnswer | AdministrativeAvatarReceipt> {
  const reply = record(await host.call('botAvatarSet', args));
  if (allowMetadata && reply?.['metadataOnly'] === true)
    return { metadataOnly: true, bot: readAdministrativeBot(reply['bot'], 'botAvatarSet') };
  if (reply?.['metadataOnly'] !== undefined)
    throw new HostAnswerInvalid('botAvatarSet returned unexpected administrative metadata.');
  return readChangedBot(reply, 'botAvatarSet');
}

export async function setBotBanner(
  host: HostCall,
  args: { channelId: string; banner: unknown },
): Promise<ChangedBotAnswer> {
  return readChangedBot(await host.call('botBannerSet', args), 'botBannerSet');
}

export async function setBotAppearance(
  host: HostCall,
  args: { channelId: string; recipe: unknown },
): Promise<ChangedBotAnswer> {
  return readChangedBot(await host.call('botAppearanceSet', args), 'botAppearanceSet');
}

function isCompaction(value: unknown): value is WireBotCompactResult {
  const row = record(value);
  const outcome = row?.['outcome'];
  return (
    (outcome === 'compacted' ||
      outcome === 'nothing' ||
      outcome === 'busy' ||
      outcome === 'not-loaded') &&
    (row?.['tokensBefore'] === null || count(row?.['tokensBefore'])) &&
    (row['tokensAfter'] === null || count(row['tokensAfter']))
  );
}

export function parseBotCompactResult(value: unknown): WireBotCompactResult {
  return answer(value, isCompaction, 'botCompact');
}

export async function compactBot(host: HostCall, slug: string): Promise<WireBotCompactResult> {
  return parseBotCompactResult(await host.call('botCompact', { slug }));
}

export async function newBotSession(host: HostCall, slug: string): Promise<{ started: true }> {
  const row = record(await host.call('botNewSession', { slug }));
  if (row?.['started'] !== true)
    throw new HostAnswerInvalid('botNewSession did not confirm the new Session.');
  return { started: true };
}

function isSessionRef(value: unknown): value is WireStoppedSessionRef {
  const row = record(value);
  return (
    text(row?.['botSlug']) &&
    text(row['sessionId']) &&
    (row['role'] === 'orchestrator' || row['role'] === 'assignment')
  );
}

function isStopResult(value: unknown): value is WireSessionStopResult {
  const row = record(value);
  return (
    Array.isArray(row?.['stopped']) &&
    row['stopped'].every(isSessionRef) &&
    Array.isArray(row['alreadyIdle']) &&
    row['alreadyIdle'].every(isSessionRef) &&
    optional(row['messageId'], text)
  );
}

export async function stopBot(
  host: HostCall,
  args: Record<string, unknown>,
): Promise<WireSessionStopResult> {
  return answer(await host.call('botStop', args), isStopResult, 'botStop');
}

export async function stopSession(
  host: HostCall,
  args: Record<string, unknown>,
): Promise<WireSessionStopResult> {
  return answer(await host.call('sessionStop', args), isStopResult, 'sessionStop');
}
