import {
  sessionModelChoice,
  type SessionModelChoice,
  type SessionModelState,
} from '@botharness/host-protocol/session-model';
import { asRecord, bridgeHost, unwrap, type BridgeCall } from '../../bridge-transport.js';
import * as botControl from '@botharness/host-client/bot-control';
import type {
  WireBotCompactResult,
  WireSessionStopResult,
  WireStoppedSessionRef,
} from '@botharness/host-protocol/wire';
import {
  isTurnTarget,
  isTurnTargetPath,
  isTurnTargetSwitchReason,
  type TurnModelSwitch,
  type TurnTarget,
} from '@botharness/host-protocol/turn-target';
import type { OwnedSessionSummary } from '../../store.js';
import { parseSessionModelRoute } from '../../session-model-route.js';
import type { SessionBotOwner } from '../../bridge.js';

export function createSessionOwnerBridge(
  isAvatarAppearance: (value: unknown) => value is NonNullable<SessionBotOwner['appearance']>,
) {
  function parseSessionBotOwner(value: unknown): SessionBotOwner | undefined {
    const owner = asRecord(asRecord(value)?.['owner']);
    if (owner === undefined) return undefined;
    const botSlug = owner['botSlug'];
    const displayName = owner['displayName'];
    const role = owner['role'];
    if (typeof botSlug !== 'string' || botSlug.length === 0) return undefined;
    if (typeof displayName !== 'string' || displayName.length === 0) return undefined;
    if (role !== 'orchestrator' && role !== 'assignment') return undefined;
    const avatar = owner['avatar'];
    return {
      botSlug,
      displayName,
      ...(typeof avatar === 'string' && avatar.length > 0 ? { avatar } : {}),
      ...(isAvatarAppearance(owner['appearance']) ? { appearance: owner['appearance'] } : {}),
      ...(owner['avatarSeed'] === 2 ? { avatarSeed: 2 as const } : {}),
      role,
    };
  }

  async function loadSessionBotOwner(
    call: BridgeCall,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<SessionBotOwner | undefined> {
    return parseSessionBotOwner(await unwrap(call, 'sessionOwner', { sessionId }, signal));
  }
  return { parseSessionBotOwner, loadSessionBotOwner };
}

export function parseOwnedSessionSummaries(value: unknown): OwnedSessionSummary[] {
  const sessions = asRecord(value)?.['sessions'];
  if (!Array.isArray(sessions)) return [];
  return sessions.flatMap((entry) => {
    const record = asRecord(entry);
    if (record === undefined) return [];
    const sessionId = record['sessionId'];
    const role = record['role'];
    const createdAt = record['createdAt'];
    const activity = record['assignmentActivity'];
    const accessMode = record['assignmentAccessMode'];
    if (typeof sessionId !== 'string' || sessionId.length === 0) return [];
    if (role !== 'orchestrator' && role !== 'assignment') return [];
    if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt))) return [];
    if (
      activity !== undefined &&
      activity !== 'working' &&
      activity !== 'idle' &&
      activity !== 'error' &&
      activity !== 'stopping' &&
      activity !== 'stopped'
    )
      return [];
    const cwdReference = record['cwdReference'];
    const currentOrchestrator = record['currentOrchestrator'];
    const reportState = record['assignmentReportState'];
    const executionWait = record['assignmentExecutionWait'];
    const engine = parseSessionEngine(record['engine']);
    const currentTarget = record['currentTarget'];
    return [
      {
        sessionId,
        role,
        createdAt,
        ...(typeof cwdReference === 'string' ? { cwdReference } : {}),
        ...(role === 'orchestrator' && typeof currentOrchestrator === 'boolean'
          ? { currentOrchestrator }
          : {}),
        ...(role === 'orchestrator' &&
        typeof record['triageOpenCount'] === 'number' &&
        Number.isSafeInteger(record['triageOpenCount']) &&
        record['triageOpenCount'] > 0
          ? { triageOpenCount: record['triageOpenCount'] }
          : {}),
        ...(activity === undefined ? {} : { assignmentActivity: activity }),
        ...(role === 'assignment' &&
        (accessMode === 'workspace-write' || accessMode === 'danger-full-access')
          ? { assignmentAccessMode: accessMode }
          : {}),
        ...(role === 'assignment' &&
        (reportState === 'progress' ||
          reportState === 'completed' ||
          reportState === 'blocked' ||
          reportState === 'waiting-human' ||
          reportState === 'failed')
          ? { assignmentReportState: reportState }
          : {}),
        ...(role === 'assignment' &&
        (executionWait === 'waiting-human' || executionWait === 'waiting-capacity')
          ? { assignmentExecutionWait: executionWait }
          : {}),
        ...(role === 'assignment' && record['assignmentArchived'] === true
          ? { assignmentArchived: true as const }
          : {}),
        ...(role === 'assignment' && typeof record['assignmentTitle'] === 'string'
          ? { assignmentTitle: record['assignmentTitle'] }
          : {}),
        ...(role === 'assignment' && typeof record['assignmentDescription'] === 'string'
          ? { assignmentDescription: record['assignmentDescription'] }
          : {}),
        ...(role === 'assignment' && parseSessionModelRoute(record['assignmentModelRoute'])
          ? {
              assignmentModelRoute: parseSessionModelRoute(record['assignmentModelRoute'])!,
            }
          : {}),
        ...(parseSessionModelRoute(record['modelRoute'])
          ? { modelRoute: parseSessionModelRoute(record['modelRoute'])! }
          : {}),
        ...(engine === undefined ? {} : { engine }),
        ...(isTurnTarget(currentTarget) ? { currentTarget } : {}),
        ...(typeof record['agentPreset'] === 'string' && record['agentPreset'].length > 0
          ? { agentPreset: record['agentPreset'] }
          : {}),
        ...(typeof record['subagentCount'] === 'number' &&
        Number.isSafeInteger(record['subagentCount']) &&
        record['subagentCount'] > 0
          ? { subagentCount: record['subagentCount'] }
          : {}),
      },
    ];
  });
}

export interface CompactionThresholdRange {
  defaultValue: number;
  min: number;
  max: number;
}

export interface CompactionThreshold {
  ratio: number;
  headroomTokens: number;
  ratioSet: boolean;
  headroomSet: boolean;
  ratioRange: CompactionThresholdRange;
  headroomRange: CompactionThresholdRange;
}

export interface IdleCompactionStatus {
  enabled: boolean;
  settingReadable: boolean;
  threshold?: CompactionThreshold;
}

function parseThresholdRange(value: unknown): CompactionThresholdRange | undefined {
  const item = asRecord(value);
  const numbers = [item?.['defaultValue'], item?.['min'], item?.['max']];
  if (!numbers.every((entry) => typeof entry === 'number' && Number.isFinite(entry)))
    return undefined;
  const [defaultValue, min, max] = numbers as number[];
  return { defaultValue: defaultValue!, min: min!, max: max! };
}

function parseCompactionThreshold(value: unknown): CompactionThreshold | undefined {
  const item = asRecord(value);
  const ratioRange = parseThresholdRange(item?.['ratioRange']);
  const headroomRange = parseThresholdRange(item?.['headroomRange']);
  const ratio = item?.['ratio'];
  const headroomTokens = item?.['headroomTokens'];
  if (
    ratioRange === undefined ||
    headroomRange === undefined ||
    typeof ratio !== 'number' ||
    typeof headroomTokens !== 'number'
  )
    return undefined;
  return {
    ratio,
    headroomTokens,
    ratioSet: item?.['ratioSet'] === true,
    headroomSet: item?.['headroomSet'] === true,
    ratioRange,
    headroomRange,
  };
}

export function parseIdleCompactionStatus(value: unknown): IdleCompactionStatus {
  const item =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  if (typeof item['enabled'] !== 'boolean') throw new Error('invalid idle compaction status');
  const threshold = parseCompactionThreshold(item['threshold']);
  return {
    enabled: item['enabled'],
    settingReadable: item['settingReadable'] !== false,
    ...(threshold === undefined ? {} : { threshold }),
  };
}

export type BotCompactResult = WireBotCompactResult;

export async function loadIdleCompaction(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<IdleCompactionStatus> {
  return parseIdleCompactionStatus(await unwrap(call, 'idleCompaction', {}, signal));
}

export async function setIdleCompaction(
  call: BridgeCall,
  enabled: boolean,
): Promise<IdleCompactionStatus> {
  return parseIdleCompactionStatus(await unwrap(call, 'idleCompactionSet', { enabled }));
}

export async function setCompactionThreshold(
  call: BridgeCall,
  threshold: { thresholdRatio?: number | null; headroomTokens?: number | null },
): Promise<IdleCompactionStatus> {
  return parseIdleCompactionStatus(await unwrap(call, 'compactionThresholdSet', threshold));
}

export type SessionTranscriptTrigger =
  | 'request'
  | 'goal'
  | 'agent'
  | 'team'
  | 'subagent'
  | 'github'
  | 'webhook'
  | 'schedule'
  | 'job'
  | 'plugin';

const SESSION_TRIGGERS: readonly string[] = [
  'request',
  'goal',
  'agent',
  'team',
  'subagent',
  'github',
  'webhook',
  'schedule',
  'job',
  'plugin',
];

export interface SessionTurnUsage {
  tokens: number;
  output: number;
  outputMs: number;
}

export interface SessionToolTargets {
  command?: string;
  path?: string;
  url?: string;
}

export interface SessionTranscriptEnvelope {
  kind: 'human-dm' | 'group' | 'bot-dm' | 'inbox' | 'other';
  channelId?: string;
  messageId?: string;
}

const ENVELOPE_KINDS = ['human-dm', 'group', 'bot-dm', 'inbox', 'other'] as const;

function parseTranscriptEnvelope(value: unknown): SessionTranscriptEnvelope | undefined {
  const record = asRecord(value);
  const kind = record?.['kind'];
  if (record === undefined || !ENVELOPE_KINDS.includes(kind as SessionTranscriptEnvelope['kind']))
    return undefined;
  return {
    kind: kind as SessionTranscriptEnvelope['kind'],
    ...(typeof record['channelId'] === 'string' ? { channelId: record['channelId'] } : {}),
    ...(typeof record['messageId'] === 'string' ? { messageId: record['messageId'] } : {}),
  };
}

export type SessionTranscriptItem =
  | {
      kind: 'input';
      text: string;
      at: string;
      turn: number;
      source: 'user' | 'system';
      trigger?: SessionTranscriptTrigger;
      envelope?: SessionTranscriptEnvelope;
    }
  | ({ kind: 'model-switch'; at: string } & TurnModelSwitch)
  | { kind: 'reply'; text: string; at: string; live?: true; turnTargets?: TurnTarget[] }
  | {
      kind: 'reasoning';
      text: string;
      at: string;
      durationMs?: number;
      live?: true;
    }
  | ({
      kind: 'tool';
      id: string;
      tool: string;
      toolKind: SessionToolKind;
      status: 'running' | 'done' | 'failed' | 'denied' | 'cancelled';
      detail?: string;
      added?: number;
      removed?: number;
      at: string;
      endedAt?: string;
      live?: true;
    } & SessionToolTargets)
  | {
      kind: 'turn-end';
      state: 'done' | 'failed' | 'cancelled';
      at: string;
      message?: string;
      usage?: SessionTurnUsage;
      turnTargets?: TurnTarget[];
    };

export type SessionToolKind =
  | 'read'
  | 'edit'
  | 'delete'
  | 'move'
  | 'search'
  | 'execute'
  | 'fetch'
  | 'other';

const SESSION_TOOL_KINDS: readonly string[] = [
  'read',
  'edit',
  'delete',
  'move',
  'search',
  'execute',
  'fetch',
];

export interface SessionEngineQuota {
  usedPercent?: number;
  resetsAt?: string;
  limitedUntil?: string;
  observedAt: string;
}

export interface SessionEngine {
  engine: string;
  account?: string;
  state: 'starting' | 'running' | 'waiting-approval' | 'idle';
  quota?: SessionEngineQuota;
}

export function parseSessionEngineQuota(value: unknown): SessionEngineQuota | undefined {
  const quota = asRecord(value);
  if (quota === undefined || typeof quota['observedAt'] !== 'string') return undefined;
  const time = (field: unknown) =>
    typeof field === 'string' && Number.isFinite(Date.parse(field)) ? field : undefined;
  const percent = quota['usedPercent'];
  const resetsAt = time(quota['resetsAt']);
  const limitedUntil = time(quota['limitedUntil']);
  return {
    ...(typeof percent === 'number' && Number.isFinite(percent) ? { usedPercent: percent } : {}),
    ...(resetsAt === undefined ? {} : { resetsAt }),
    ...(limitedUntil === undefined ? {} : { limitedUntil }),
    observedAt: quota['observedAt'],
  };
}

export interface SessionTranscript {
  role: 'orchestrator' | 'assignment';
  items: SessionTranscriptItem[];
  omitted: number;
  running: boolean;
  seq: number;
  engine?: SessionEngine;
  currentTarget?: TurnTarget;
}

function parseSessionEngine(value: unknown): SessionEngine | undefined {
  const engine = asRecord(value);
  if (engine === undefined || typeof engine['engine'] !== 'string') return undefined;
  const state = engine['state'];
  const quota = parseSessionEngineQuota(engine['quota']);
  return {
    engine: engine['engine'],
    ...(typeof engine['account'] === 'string' ? { account: engine['account'] } : {}),
    state:
      state === 'starting' || state === 'running' || state === 'waiting-approval' ? state : 'idle',
    ...(quota === undefined ? {} : { quota }),
  };
}

export interface SessionLiveSnapshot {
  revision: number;
  seq: number;
  items: SessionTranscriptItem[];
}

export type SessionToolDetail =
  | { card: 'terminal'; command?: string; output: string; exitCode?: number }
  | {
      card: 'diff';
      files: { path: string; oldText: string | null; newText: string }[];
    }
  | {
      card: 'read';
      path: string;
      offset: number;
      totalLines: number;
      lines: { number: number; text: string }[];
    }
  | {
      card: 'search';
      total: number;
      truncated: boolean;
      files: {
        path: string;
        matches: { lineNumber: number; line: string }[];
      }[];
      paths: string[];
    }
  | {
      card: 'web';
      url?: string;
      statusCode?: number;
      sources: { url: string; title?: string }[];
      output: string;
    }
  | { card: 'text'; input?: string; output: string };

const TRANSCRIPT_TOOL_STATUSES = ['running', 'done', 'failed', 'denied', 'cancelled'];

const TRANSCRIPT_END_STATES = ['done', 'failed', 'cancelled'];

export function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function targets(item: Record<string, unknown>): SessionToolTargets {
  const { command, path, url } = item;
  return {
    ...(typeof command === 'string' ? { command } : {}),
    ...(typeof path === 'string' ? { path } : {}),
    ...(typeof url === 'string' && /^https?:\/\//iu.test(url) ? { url } : {}),
  };
}

function parseUsage(value: unknown): SessionTurnUsage | undefined {
  const usage = asRecord(value);
  const tokens = finite(usage?.['tokens']);
  const output = finite(usage?.['output']);
  const outputMs = finite(usage?.['outputMs']);
  return tokens === undefined || output === undefined || outputMs === undefined
    ? undefined
    : { tokens, output, outputMs };
}

function parseTranscriptItem(value: unknown): SessionTranscriptItem | undefined {
  const item = asRecord(value);
  const at = item?.['at'];
  const text = item?.['text'];
  if (item === undefined || typeof at !== 'string') return undefined;
  const path = item['turnTargets'];
  const attribution = isTurnTargetPath(path) ? { turnTargets: path } : {};
  switch (item['kind']) {
    case 'input':
      return typeof text === 'string' && typeof item['turn'] === 'number'
        ? {
            kind: 'input',
            text,
            at,
            turn: item['turn'],
            source: item['source'] === 'system' ? 'system' : 'user',
            ...(SESSION_TRIGGERS.includes(item['trigger'] as string)
              ? { trigger: item['trigger'] as SessionTranscriptTrigger }
              : {}),
            ...(parseTranscriptEnvelope(item['envelope']) === undefined
              ? {}
              : { envelope: parseTranscriptEnvelope(item['envelope'])! }),
          }
        : undefined;
    case 'reply':
      return typeof text === 'string' ? { kind: 'reply', text, at, ...attribution } : undefined;
    case 'reasoning': {
      const durationMs = finite(item['durationMs']);
      return typeof text === 'string'
        ? {
            kind: 'reasoning',
            text,
            at,
            ...(durationMs === undefined ? {} : { durationMs }),
          }
        : undefined;
    }
    case 'tool': {
      const { id, tool, status, detail, toolKind, endedAt } = item;
      const added = finite(item['added']);
      const removed = finite(item['removed']);
      const resolvedStatus = status === undefined ? 'running' : status;
      return typeof id === 'string' &&
        typeof tool === 'string' &&
        TRANSCRIPT_TOOL_STATUSES.includes(resolvedStatus as string)
        ? {
            kind: 'tool',
            id,
            tool,
            toolKind: SESSION_TOOL_KINDS.includes(toolKind as string)
              ? (toolKind as SessionToolKind)
              : 'other',
            status: resolvedStatus as Extract<SessionTranscriptItem, { kind: 'tool' }>['status'],
            ...(typeof detail === 'string' ? { detail } : {}),
            ...targets(item),
            ...(added === undefined ? {} : { added }),
            ...(removed === undefined ? {} : { removed }),
            at,
            ...(typeof endedAt === 'string' ? { endedAt } : {}),
          }
        : undefined;
    }
    case 'model-switch': {
      const { from, to, reason } = item;
      return isTurnTarget(from) && isTurnTarget(to)
        ? {
            kind: 'model-switch',
            at,
            from,
            to,
            ...(isTurnTargetSwitchReason(reason) ? { reason } : {}),
          }
        : undefined;
    }
    case 'turn-end': {
      const usage = parseUsage(item['usage']);
      return TRANSCRIPT_END_STATES.includes(item['state'] as string)
        ? {
            kind: 'turn-end',
            state: item['state'] as Extract<SessionTranscriptItem, { kind: 'turn-end' }>['state'],
            at,
            ...(typeof item['message'] === 'string' ? { message: item['message'] } : {}),
            ...(usage === undefined ? {} : { usage }),
            ...attribution,
          }
        : undefined;
    }
    default:
      return undefined;
  }
}

export function parseItems(items: unknown[]): SessionTranscriptItem[] {
  return items.flatMap((entry) => {
    const item = parseTranscriptItem(entry);
    return item === undefined ? [] : [item];
  });
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

export function parseSessionToolDetail(value: unknown): SessionToolDetail | undefined {
  const detail = asRecord(value);
  const output = typeof detail?.['output'] === 'string' ? detail['output'] : '';
  switch (detail?.['card']) {
    case 'terminal':
      return {
        card: 'terminal',
        ...(typeof detail['command'] === 'string' ? { command: detail['command'] } : {}),
        output,
        ...(typeof detail['exitCode'] === 'number' ? { exitCode: detail['exitCode'] } : {}),
      };
    case 'diff':
      return {
        card: 'diff',
        files: (Array.isArray(detail['files']) ? detail['files'] : []).flatMap((entry) => {
          const file = asRecord(entry);
          return file !== undefined &&
            typeof file['path'] === 'string' &&
            typeof file['newText'] === 'string'
            ? [
                {
                  path: file['path'],
                  oldText: typeof file['oldText'] === 'string' ? file['oldText'] : null,
                  newText: file['newText'],
                },
              ]
            : [];
        }),
      };
    case 'read':
      return typeof detail['path'] === 'string'
        ? {
            card: 'read',
            path: detail['path'],
            offset: finite(detail['offset']) ?? 1,
            totalLines: finite(detail['totalLines']) ?? 0,
            lines: (Array.isArray(detail['lines']) ? detail['lines'] : []).flatMap((entry) => {
              const line = asRecord(entry);
              return line !== undefined &&
                typeof line['number'] === 'number' &&
                typeof line['text'] === 'string'
                ? [{ number: line['number'], text: line['text'] }]
                : [];
            }),
          }
        : undefined;
    case 'search':
      return {
        card: 'search',
        total: finite(detail['total']) ?? 0,
        truncated: detail['truncated'] === true,
        files: (Array.isArray(detail['files']) ? detail['files'] : []).flatMap((entry) => {
          const file = asRecord(entry);
          if (file === undefined || typeof file['path'] !== 'string') return [];
          return [
            {
              path: file['path'],
              matches: (Array.isArray(file['matches']) ? file['matches'] : []).flatMap((item) => {
                const match = asRecord(item);
                return match !== undefined &&
                  typeof match['lineNumber'] === 'number' &&
                  typeof match['line'] === 'string'
                  ? [{ lineNumber: match['lineNumber'], line: match['line'] }]
                  : [];
              }),
            },
          ];
        }),
        paths: strings(detail['paths']),
      };
    case 'web':
      return {
        card: 'web',
        ...(typeof detail['url'] === 'string' ? { url: detail['url'] } : {}),
        ...(typeof detail['statusCode'] === 'number' ? { statusCode: detail['statusCode'] } : {}),
        sources: (Array.isArray(detail['sources']) ? detail['sources'] : []).flatMap((entry) => {
          const source = asRecord(entry);
          return source !== undefined && typeof source['url'] === 'string'
            ? [
                {
                  url: source['url'],
                  ...(typeof source['title'] === 'string' ? { title: source['title'] } : {}),
                },
              ]
            : [];
        }),
        output,
      };
    case 'text':
      return {
        card: 'text',
        ...(typeof detail['input'] === 'string' ? { input: detail['input'] } : {}),
        output,
      };
    default:
      return undefined;
  }
}

export async function loadSessionToolDetail(
  call: BridgeCall,
  slug: string,
  sessionId: string,
  callId: string,
): Promise<SessionToolDetail> {
  const value = asRecord(await unwrap(call, 'sessionToolDetail', { slug, sessionId, callId }));
  const detail = parseSessionToolDetail(value?.['detail']);
  if (detail === undefined) throw new Error('invalid sessionToolDetail response');
  return detail;
}

export async function sessionModel(
  call: BridgeCall,
  slug: string,
  sessionId: string,
  choice?: SessionModelChoice | null,
): Promise<SessionModelState> {
  const value = asRecord(
    await unwrap(call, 'sessionModel', {
      slug,
      sessionId,
      ...(choice === undefined ? {} : { choice }),
    }),
  );
  if (value === undefined || !('override' in value) || !('default' in value))
    throw new Error('invalid sessionModel response');
  return {
    override: sessionModelChoice(value.override) ?? null,
    default: sessionModelChoice(value.default) ?? null,
    ...(value.active === undefined ? {} : { active: sessionModelChoice(value.active) ?? null }),
  };
}

export async function loadSessionTranscript(
  call: BridgeCall,
  slug: string,
  sessionId: string,
): Promise<SessionTranscript> {
  const value = asRecord(await unwrap(call, 'sessionTranscript', { slug, sessionId }));
  const items = value?.['items'];
  if (value === undefined || !Array.isArray(items))
    throw new Error('invalid sessionTranscript response');
  const engine = parseSessionEngine(value['engine']);
  const currentTarget = value['currentTarget'];
  return {
    role: value['role'] === 'orchestrator' ? 'orchestrator' : 'assignment',
    items: parseItems(items),
    omitted: typeof value['omitted'] === 'number' ? value['omitted'] : 0,
    running: value['running'] === true,
    seq: finite(value['seq']) ?? 0,
    ...(engine === undefined ? {} : { engine }),
    ...(isTurnTarget(currentTarget) ? { currentTarget } : {}),
  };
}

export async function loadBotSessionIds(call: BridgeCall, signal?: AbortSignal): Promise<string[]> {
  const value = await unwrap(call, 'botSessionIds', {}, signal);
  const ids =
    typeof value === 'object' && value !== null
      ? (value as { sessionIds?: unknown }).sessionIds
      : [];
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}

export async function loadBotSessionGroups(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<{ botSlug: string; displayName: string; sessionIds: string[] }[]> {
  const value = asRecord(await unwrap(call, 'botSessionIds', {}, signal));
  const groups = value?.['groups'];
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((item) => {
    const group = asRecord(item);
    if (
      typeof group?.['botSlug'] !== 'string' ||
      typeof group['displayName'] !== 'string' ||
      !Array.isArray(group['sessionIds'])
    )
      return [];
    return [
      {
        botSlug: group['botSlug'],
        displayName: group['displayName'],
        sessionIds: group['sessionIds'].filter((id): id is string => typeof id === 'string'),
      },
    ];
  });
}

export async function loadSessions(
  call: BridgeCall,
  slug: string,
  signal?: AbortSignal,
): Promise<OwnedSessionSummary[]> {
  return parseOwnedSessionSummaries(await unwrap(call, 'sessions', { slug }, signal));
}

export async function setSessionArchived(
  call: BridgeCall,
  slug: string,
  sessionId: string,
  archived: boolean,
): Promise<boolean> {
  const value = asRecord(await unwrap(call, 'sessionArchiveSet', { slug, sessionId, archived }));
  return value?.['archived'] === true;
}

export type StoppedSessionRef = WireStoppedSessionRef;

export type SessionStopResult = WireSessionStopResult;

export async function stopSession(
  call: BridgeCall,
  botSlug: string,
  session: string | { activityId: string },
  channelId?: string,
): Promise<SessionStopResult> {
  return botControl.stopSession(bridgeHost(call), {
    botSlug,
    ...(typeof session === 'string' ? { sessionId: session } : session),
    ...(channelId === undefined ? {} : { channelId }),
  });
}

export async function stopBot(
  call: BridgeCall,
  botSlug: string,
  channelId?: string,
): Promise<SessionStopResult> {
  return botControl.stopBot(bridgeHost(call), {
    botSlug,
    ...(channelId === undefined ? {} : { channelId }),
  });
}

export async function sendSessionRequest(
  call: BridgeCall,
  slug: string,
  sessionId: string,
  text: string,
  steer: boolean,
): Promise<void> {
  const value = asRecord(
    await unwrap(call, 'botToolRun', {
      slug,
      tool: 'unarchive_assignment',
      args: {
        session_id: sessionId,
        message: text,
        mode: steer ? 'next-step' : 'next-turn',
      },
    }),
  );
  let result: unknown = value?.['result'];
  if (typeof result === 'string') {
    try {
      result = JSON.parse(result);
    } catch {
      result = undefined;
    }
  }
  const outcome = asRecord(result);
  if (outcome?.['code'] !== undefined)
    throw new Error(
      typeof outcome['message'] === 'string' ? outcome['message'] : String(outcome['code']),
    );
}

export async function sendOrchestratorMessage(
  call: BridgeCall,
  botSlug: string,
  sessionId: string,
  text: string,
): Promise<void> {
  await unwrap(call, 'sessionMessageSend', { botSlug, sessionId, text });
}
