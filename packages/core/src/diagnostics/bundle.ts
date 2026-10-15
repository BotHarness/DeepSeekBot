import type { ChannelMessage, ChannelRecord } from '../channels/channel.js';
import type { ChannelStore } from '../channels/store.js';
import { MAX_MESSAGE_PAGE } from '../channels/timeline.js';
import { writeZip } from '../bots/zip-archive.js';
import type { InboxHistoryItem, InboxHistoryQuery } from '../runtime/inbox-history.js';
import type { SessionOwnership, SessionOwnershipRecord } from '../sessions/ownership.js';
import type { DshSessionEvent } from '../sessions/source.js';
import type { DiagnosticRedactionRule, DiagnosticRedactor } from './redaction.js';

export const DIAGNOSTIC_BUNDLE_FORMAT = 'deepseekbot-diagnostics';
export const DIAGNOSTIC_BUNDLE_VERSION = 1;
export const DIAGNOSTIC_BUNDLE_DEFAULT_PADDING_MINUTES = 30;

export const DIAGNOSTIC_BUNDLE_LIMITS = {
  maxPaddingMinutes: 6 * 60,
  maxRangeMs: 7 * 24 * 60 * 60 * 1000,
  maxInFlightExtensionMs: 6 * 60 * 60 * 1000,
  maxMessagesPerChannel: 5_000,
  maxAdmissionsPerBot: 2_000,
  maxSessions: 64,
  maxSelectedMessages: 200,
  maxEventsPerSession: 20_000,
  maxBytes: 128 * 1024 * 1024,
} as const;

export type DiagnosticBundleErrorCode =
  | 'invalid-input'
  | 'channel-not-found'
  | 'message-not-found'
  | 'range-too-large'
  | 'too-large';

export class DiagnosticBundleError extends Error {
  constructor(
    readonly code: DiagnosticBundleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DiagnosticBundleError';
  }
}

export interface DiagnosticBundleSelection {
  channelId: string;
  fromMessageId: string;
  toMessageId?: string;
  messageIds?: readonly string[];
  paddingMinutes?: number;
}

export interface DiagnosticBundleSource {
  channels: Pick<ChannelStore, 'get' | 'list' | 'message' | 'queryMessages'>;
  inboxHistory: Pick<InboxHistoryQuery, 'list'>;
  ownership: Pick<SessionOwnership, 'rootsFor' | 'descendantsOf'>;
  botName(slug: string): string | undefined;
  readSession(sessionId: string): Promise<readonly DshSessionEvent[] | undefined>;
  environment: {
    version: string;
    dshVersion?: string;
    platform: string;
    arch: string;
    node: string;
  };
  now?: () => number;
}

export interface DiagnosticBundleOmission {
  kind: string;
  detail: string;
}

interface ExportedChannel {
  id: string;
  type: ChannelRecord['type'];
  name: string;
  role: 'selected' | 'bot-dm';
  botSlug?: string;
  messages: ChannelMessage[];
}

interface ExportedSession {
  record: SessionOwnershipRecord;
  firstSeq?: number;
  lastSeq?: number;
  from?: string;
  to?: string;
  extendedForInFlightTurn: boolean;
  events: DshSessionEvent[];
}

export interface DiagnosticBundleSummary {
  channels: Array<{ id: string; type: string; name: string; role: string; messages: number }>;
  bots: Array<{ slug: string; displayName: string }>;
  sessions: Array<{
    id: string;
    bot: string;
    role: string;
    provenance: string;
    parentSessionId?: string;
    events: number;
    extendedForInFlightTurn: boolean;
  }>;
  admissions: number;
  range: { requestedStart: string; requestedEnd: string; start: string; end: string };
  redaction: { level: string; hits: Record<DiagnosticRedactionRule, number> };
  omissions: DiagnosticBundleOmission[];
}

export interface DiagnosticBundle {
  summary: DiagnosticBundleSummary;
  entries: Array<{ path: string; data: Buffer }>;
  bytes: number;
}

interface TimelineEntry {
  at: string;
  source: 'channel' | 'admission' | 'session';
  kind: string;
  channelId?: string;
  messageId?: string;
  selected?: boolean;
  sourceEventId?: string;
  bot?: string;
  sessionId?: string;
  role?: string;
  seq?: number;
  [field: string]: unknown;
}

const iso = (ms: number) => new Date(ms).toISOString();
const jsonl = (rows: readonly unknown[]) =>
  Buffer.from(rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
const excerpt = (value: string, size = 240) => {
  const characters = Array.from(value);
  return characters.length <= size ? value : characters.slice(0, size).join('') + '…';
};
const safeName = (value: string) => value.replace(/[^A-Za-z0-9_.-]/gu, '_').slice(0, 120);

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function messageBots(message: ChannelMessage): string[] {
  return [
    ...(message.author.kind === 'bot' ? [message.author.slug] : []),
    ...(message.mentions ?? []).map((mention) => mention.botSlug),
    ...(message.deliveries ?? []).map((delivery) => delivery.botSlug),
  ];
}

function readChannelRange(
  source: DiagnosticBundleSource,
  channelId: string,
  start: number,
  end: number,
  omissions: DiagnosticBundleOmission[],
): ChannelMessage[] {
  const messages: ChannelMessage[] = [];
  let cursor: string | undefined;
  do {
    const page = source.channels.queryMessages(channelId, {
      from: iso(start),
      to: iso(end),
      orderBy: 'time',
      limit: MAX_MESSAGE_PAGE,
      ...(cursor === undefined ? {} : { cursor }),
    });
    messages.push(...page.messages);
    cursor = page.nextCursor;
    if (messages.length >= DIAGNOSTIC_BUNDLE_LIMITS.maxMessagesPerChannel && cursor) {
      omissions.push({
        kind: 'channel-messages',
        detail: `${channelId}: only the latest ${messages.length} messages in range`,
      });
      break;
    }
  } while (cursor !== undefined);
  return messages.reverse();
}

function readAdmissions(
  source: DiagnosticBundleSource,
  botSlug: string,
  start: number,
  end: number,
  channels: ReadonlySet<string>,
  omissions: DiagnosticBundleOmission[],
): InboxHistoryItem[] {
  const items: InboxHistoryItem[] = [];
  let cursor: string | undefined;
  do {
    const page = source.inboxHistory.list(botSlug, {
      since: iso(start),
      until: iso(end),
      limit: 50,
      ...(cursor === undefined ? {} : { cursor }),
    });
    items.push(
      ...page.items.filter((item) => item.channelId === undefined || channels.has(item.channelId)),
    );
    cursor = page.nextCursor;
    if (items.length >= DIAGNOSTIC_BUNDLE_LIMITS.maxAdmissionsPerBot && cursor) {
      omissions.push({ kind: 'admissions', detail: `${botSlug}: admissions truncated` });
      break;
    }
  } while (cursor !== undefined);
  return items.sort((left, right) => left.at.localeCompare(right.at));
}

export function sliceSessionEvents(
  events: readonly DshSessionEvent[],
  start: number,
  end: number,
): { events: DshSessionEvent[]; extendedForInFlightTurn: boolean } {
  let openTurn: number | undefined;
  let first: number | undefined;
  let extended = false;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    if (event.time >= start) {
      if (
        openTurn !== undefined &&
        events[openTurn]!.time >= start - DIAGNOSTIC_BUNDLE_LIMITS.maxInFlightExtensionMs
      ) {
        first = openTurn;
        extended = true;
      } else first = index;
      break;
    }
    if (event.type === 'turn/start') openTurn = index;
    else if (event.type === 'turn/end') openTurn = undefined;
  }
  if (first === undefined) return { events: [], extendedForInFlightTurn: false };
  let last = first - 1;
  let inTurn = false;
  for (let index = first; index < events.length; index += 1) {
    const event = events[index]!;
    if (event.time > end && !inTurn) break;
    last = index;
    if (event.type === 'turn/start') inTurn = true;
    else if (event.type === 'turn/end') {
      inTurn = false;
      if (event.time > end) break;
    }
  }
  const sliced = events.slice(first, last + 1);
  return { events: sliced, extendedForInFlightTurn: extended && sliced.length > 0 };
}

function channelTimelineEntry(channel: ExportedChannel, message: ChannelMessage): TimelineEntry {
  const notice = message.botChannelPost
    ? 'botChannelPost'
    : message.botDmAction
      ? 'botDmAction'
      : message.botCreateAction
        ? 'botCreateAction'
        : message.memoryCommit
          ? 'memoryCommit'
          : message.sessionFailure
            ? 'sessionFailure'
            : message.toolApprovalRequest
              ? 'toolApprovalRequest'
              : undefined;
  return {
    at: message.at,
    source: 'channel',
    kind: notice === undefined ? 'message' : `notice:${notice}`,
    channelId: channel.id,
    channelType: channel.type,
    messageId: message.id,
    author: message.author,
    ...(message.mentions?.length
      ? { mentions: message.mentions.map((mention) => mention.botSlug) }
      : {}),
    ...(message.deliveries?.length ? { deliveries: message.deliveries } : {}),
    ...(message.botChannelPost ? { postedIn: message.botChannelPost } : {}),
    ...(message.botDmAction ? { dmAction: message.botDmAction } : {}),
    ...(message.noticeOrigin ? { noticeOrigin: message.noticeOrigin } : {}),
    ...(message.botCausation ? { causation: message.botCausation } : {}),
    ...(message.assignmentReply ? { assignmentReply: message.assignmentReply } : {}),
    ...(message.body.length ? { excerpt: excerpt(message.body) } : {}),
  };
}

function sessionTimelineEntry(
  session: ExportedSession,
  event: DshSessionEvent,
  redactor: DiagnosticRedactor,
): TimelineEntry | undefined {
  const data = recordOf(event.data);
  const base: TimelineEntry = {
    at: iso(event.time),
    source: 'session',
    kind: event.type,
    sessionId: session.record.sessionId,
    bot: session.record.botSlug,
    role: session.record.rootRole,
    ...(event.seq === undefined ? {} : { seq: event.seq }),
  };
  if (event.type === 'turn/start' || event.type === 'turn/end') return base;
  if (event.type === 'tool/call') {
    const args = redactor.value(data?.['arguments']);
    return {
      ...base,
      tool: data?.['name'],
      callId: data?.['callId'],
      ...(args === undefined
        ? {}
        : { arguments: excerpt(typeof args === 'string' ? args : JSON.stringify(args), 400) }),
    };
  }
  if (event.type === 'tool/result')
    return {
      ...base,
      callId: data?.['callId'],
      ...(data?.['isError'] === undefined ? {} : { isError: data['isError'] }),
    };
  if (/error|fail|abort|cancel/iu.test(event.type)) return base;
  return undefined;
}

export async function collectDiagnosticBundle(
  source: DiagnosticBundleSource,
  selection: DiagnosticBundleSelection,
  redactor: DiagnosticRedactor,
): Promise<DiagnosticBundle> {
  const now = (source.now ?? Date.now)();
  const padding = selection.paddingMinutes ?? DIAGNOSTIC_BUNDLE_DEFAULT_PADDING_MINUTES;
  if (
    typeof selection.channelId !== 'string' ||
    typeof selection.fromMessageId !== 'string' ||
    (selection.toMessageId !== undefined && typeof selection.toMessageId !== 'string') ||
    (selection.messageIds !== undefined &&
      (!Array.isArray(selection.messageIds) ||
        selection.messageIds.length > DIAGNOSTIC_BUNDLE_LIMITS.maxSelectedMessages ||
        selection.messageIds.some((id) => typeof id !== 'string'))) ||
    !Number.isInteger(padding) ||
    padding < 0 ||
    padding > DIAGNOSTIC_BUNDLE_LIMITS.maxPaddingMinutes
  )
    throw new DiagnosticBundleError('invalid-input', 'Select a Channel, message and padding');
  const selected = source.channels.get(selection.channelId);
  if (selected === undefined)
    throw new DiagnosticBundleError('channel-not-found', 'Channel is not available');
  const fromMessage = source.channels.message(selected.id, selection.fromMessageId);
  const toMessage =
    selection.toMessageId === undefined
      ? undefined
      : source.channels.message(selected.id, selection.toMessageId);
  if (fromMessage === undefined || (selection.toMessageId !== undefined && !toMessage))
    throw new DiagnosticBundleError('message-not-found', 'Message is not in this Channel');
  const marked = new Set([
    fromMessage.id,
    ...(toMessage === undefined ? [] : [toMessage.id]),
    ...(selection.messageIds ?? []),
  ]);
  for (const id of marked)
    if (source.channels.message(selected.id, id) === undefined)
      throw new DiagnosticBundleError('message-not-found', 'Message is not in this Channel');
  let first = Date.parse(fromMessage.at);
  let last = toMessage === undefined ? now : Date.parse(toMessage.at);
  if (!Number.isFinite(first) || !Number.isFinite(last))
    throw new DiagnosticBundleError('invalid-input', 'Message time is unavailable');
  if (first > last) [first, last] = [last, first];
  const requestedStart = first - padding * 60_000;
  const requestedEnd = Math.min(last + padding * 60_000, Math.max(now, last));
  if (requestedEnd - requestedStart > DIAGNOSTIC_BUNDLE_LIMITS.maxRangeMs)
    throw new DiagnosticBundleError('range-too-large', 'Select a shorter message range');

  const omissions: DiagnosticBundleOmission[] = [];
  const selectedMessages = readChannelRange(
    source,
    selected.id,
    requestedStart,
    requestedEnd,
    omissions,
  );
  const candidateBots = new Set<string>(selectedMessages.flatMap(messageBots));
  if (selected.type === 'dm' && selected.botSlug) candidateBots.add(selected.botSlug);

  const sessions: ExportedSession[] = [];
  let start = requestedStart;
  for (const slug of [...candidateBots].sort()) {
    const records = [
      ...source.ownership.rootsFor(slug, 'orchestrator'),
      ...source.ownership.rootsFor(slug, 'assignment'),
    ].flatMap((root) => [root, ...source.ownership.descendantsOf(root.sessionId)]);
    for (const record of records) {
      if (sessions.length >= DIAGNOSTIC_BUNDLE_LIMITS.maxSessions) {
        omissions.push({ kind: 'sessions', detail: `${record.sessionId}: Session limit reached` });
        continue;
      }
      let native: readonly DshSessionEvent[] | undefined;
      try {
        native = await source.readSession(record.sessionId);
      } catch {
        native = undefined;
      }
      if (native === undefined) {
        omissions.push({ kind: 'session-unreadable', detail: record.sessionId });
        continue;
      }
      const slice = sliceSessionEvents(native, requestedStart, requestedEnd);
      if (slice.events.length === 0) continue;
      let events = slice.events;
      if (events.length > DIAGNOSTIC_BUNDLE_LIMITS.maxEventsPerSession) {
        omissions.push({
          kind: 'session-events',
          detail: `${record.sessionId}: kept the last ${DIAGNOSTIC_BUNDLE_LIMITS.maxEventsPerSession} of ${events.length} events`,
        });
        events = events.slice(-DIAGNOSTIC_BUNDLE_LIMITS.maxEventsPerSession);
      }
      start = Math.min(start, events[0]!.time);
      sessions.push({
        record,
        events,
        extendedForInFlightTurn: slice.extendedForInFlightTurn,
        from: iso(events[0]!.time),
        to: iso(events.at(-1)!.time),
        ...(events[0]!.seq === undefined ? {} : { firstSeq: events[0]!.seq }),
        ...(events.at(-1)!.seq === undefined ? {} : { lastSeq: events.at(-1)!.seq }),
      });
    }
  }
  const end = Math.max(requestedEnd, ...sessions.map((session) => session.events.at(-1)!.time));
  const involved = new Set<string>([
    ...sessions.map((session) => session.record.botSlug),
    ...candidateBots,
  ]);

  const channels: ExportedChannel[] = [
    {
      id: selected.id,
      type: selected.type,
      name: selected.name,
      role: 'selected',
      ...(selected.botSlug === undefined ? {} : { botSlug: selected.botSlug }),
      messages:
        start === requestedStart && end === requestedEnd
          ? selectedMessages
          : readChannelRange(source, selected.id, start, end, omissions),
    },
  ];
  const humanDms = new Map(
    source.channels
      .list()
      .filter((channel) => channel.type === 'dm' && channel.botSlug && !channel.deletedAt)
      .map((channel) => [channel.botSlug!, channel]),
  );
  for (const slug of [...involved].sort()) {
    const dm = humanDms.get(slug);
    if (dm === undefined || dm.id === selected.id) continue;
    channels.push({
      id: dm.id,
      type: dm.type,
      name: dm.name,
      role: 'bot-dm',
      botSlug: slug,
      messages: readChannelRange(source, dm.id, start, end, omissions),
    });
  }
  const channelIds = new Set(channels.map((channel) => channel.id));
  const admissions = [...involved].sort().flatMap((slug) =>
    readAdmissions(source, slug, start, end, channelIds, omissions).map((item) => ({
      bot: slug,
      ...item,
    })),
  );

  const timeline: TimelineEntry[] = [
    ...channels.flatMap((channel) =>
      channel.messages.map((message) => ({
        ...channelTimelineEntry(channel, message),
        ...(channel.id === selected.id && marked.has(message.id) ? { selected: true } : {}),
      })),
    ),
    ...admissions.map((item): TimelineEntry => ({
      at: item.at,
      source: 'admission',
      kind: item.kind,
      bot: item.bot,
      sourceEventId: item.sourceEventId,
      sourceKind: item.sourceKind,
      state: item.state,
      ...(item.channelId === undefined ? {} : { channelId: item.channelId }),
      ...(item.causeSourceEventId === undefined
        ? {}
        : { causeSourceEventId: item.causeSourceEventId }),
    })),
    ...sessions.flatMap((session) =>
      session.events.flatMap((event) => sessionTimelineEntry(session, event, redactor) ?? []),
    ),
  ].sort((left, right) => left.at.localeCompare(right.at));

  const bots = [...involved]
    .sort()
    .map((slug) => ({ slug, displayName: source.botName(slug) ?? slug }));
  const entries: Array<{ path: string; data: Buffer }> = [];
  entries.push({ path: 'timeline.jsonl', data: jsonl(redactor.value(timeline)) });
  for (const channel of channels)
    entries.push({
      path: `channels/${safeName(channel.id)}.jsonl`,
      data: jsonl(redactor.value(channel.messages)),
    });
  entries.push({ path: 'admissions.jsonl', data: jsonl(redactor.value(admissions)) });
  for (const session of sessions)
    entries.push({
      path: `sessions/${safeName(session.record.sessionId)}.jsonl`,
      data: jsonl(
        session.events.map((event) =>
          redactor.value(
            event.type === 'request/header' ? requestHeaderSummary(event, redactor) : event,
          ),
        ),
      ),
    });

  const summary: DiagnosticBundleSummary = {
    channels: channels.map((channel) => ({
      id: channel.id,
      type: channel.type,
      name: redactor.text(channel.name),
      role: channel.role,
      messages: channel.messages.length,
    })),
    bots,
    sessions: sessions.map((session) => ({
      id: session.record.sessionId,
      bot: session.record.botSlug,
      role: session.record.rootRole,
      provenance: session.record.provenance,
      ...(session.record.parentSessionId === undefined
        ? {}
        : { parentSessionId: session.record.parentSessionId }),
      events: session.events.length,
      extendedForInFlightTurn: session.extendedForInFlightTurn,
    })),
    admissions: admissions.length,
    range: {
      requestedStart: iso(requestedStart),
      requestedEnd: iso(requestedEnd),
      start: iso(start),
      end: iso(end),
    },
    redaction: { level: redactor.level, hits: redactor.report() },
    omissions,
  };
  const manifest = {
    format: DIAGNOSTIC_BUNDLE_FORMAT,
    version: DIAGNOSTIC_BUNDLE_VERSION,
    createdAt: iso(now),
    environment: source.environment,
    selection: {
      channelId: selected.id,
      fromMessageId: fromMessage.id,
      ...(toMessage === undefined ? {} : { toMessageId: toMessage.id }),
      messageIds: [...marked],
      paddingMinutes: padding,
    },
    ...summary,
    sessions: summary.sessions.map((entry, index) => ({
      ...entry,
      from: sessions[index]!.from,
      to: sessions[index]!.to,
      ...(sessions[index]!.firstSeq === undefined ? {} : { firstSeq: sessions[index]!.firstSeq }),
      ...(sessions[index]!.lastSeq === undefined ? {} : { lastSeq: sessions[index]!.lastSeq }),
    })),
    excluded: [
      'credentials and settings values',
      'private-input values',
      'Memory files',
      'Workspace files',
      'attachment bytes',
      'other Channels',
      'request headers',
    ],
  };
  entries.unshift(
    { path: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') },
    { path: 'README.md', data: Buffer.from(README) },
  );
  entries.push({
    path: 'redaction-report.json',
    data: Buffer.from(
      JSON.stringify({ level: redactor.level, hits: redactor.report() }, null, 2) + '\n',
    ),
  });
  const bytes = entries.reduce((total, entry) => total + entry.data.length, 0);
  if (bytes > DIAGNOSTIC_BUNDLE_LIMITS.maxBytes)
    throw new DiagnosticBundleError('too-large', 'Select a shorter message range');
  summary.redaction.hits = redactor.report();
  return { summary, entries, bytes };
}

function requestHeaderSummary(event: DshSessionEvent, redactor: DiagnosticRedactor) {
  const config = recordOf(recordOf(recordOf(event.data)?.['header'])?.['config']);
  redactor.count('request-headers');
  return {
    ...event,
    data: {
      omitted: 'request-headers',
      ...(config === undefined
        ? {}
        : {
            route: Object.fromEntries(
              ['provider', 'model', 'effort'].flatMap((field) =>
                typeof config[field] === 'string' ? [[field, config[field]]] : [],
              ),
            ),
          }),
    },
  };
}

export function diagnosticBundleZip(bundle: DiagnosticBundle): Buffer {
  return writeZip(bundle.entries);
}

const README = `# DeepSeekBot Diagnostic Bundle / 诊断包

This file was exported locally by DeepSeekBot to help diagnose a problem. DeepSeekBot never
uploads it; share it only with people you trust to read your conversations.

本文件由 DeepSeekBot 在本机导出，用于排查问题，产品不会自动上传。它包含所选范围内的聊天内容，
请只分享给你信任的人。

- \`manifest.json\`: versions, selected messages, effective time range, Bots and Sessions, omissions.
- \`timeline.jsonl\`: one time-ordered index across Channels, Inbox admissions and Session events;
  messages the user selected carry \`"selected": true\`.
- \`channels/<id>.jsonl\`: messages of the selected Channel and the involved Bots' DMs.
- \`admissions.jsonl\`: Bot Inbox admissions in the range.
- \`sessions/<id>.jsonl\`: native DSH Session events (tool calls, results, model text) in the range.
- \`redaction-report.json\`: how many items each redaction rule replaced.

Redaction (standard): the home folder becomes \`~\`, the DSH home becomes \`$DSH_HOME\`, other
absolute folders become \`<path:xxxxxx>\` while file names stay, and tokens, secret fields,
request headers and email addresses are replaced. Redaction is pattern-based and best effort:
skim the files before sharing them publicly.
`;
