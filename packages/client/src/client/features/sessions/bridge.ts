import type {
  SessionModelChoice,
  SessionModelState,
} from '@botharness/host-protocol/session-model';
import {
  ownedSessions,
  sessionModel as callSessionModel,
} from '@botharness/host-client/session-model';
import { asRecord, bridgeHost, unwrap, type BridgeCall } from '../../bridge-transport.js';
import * as botControl from '@botharness/host-client/bot-control';
import {
  finite,
  parseSessionEngine,
  parseSessionOwner,
  sessionOwner,
  sendOrchestratorMessage as messageOrchestrator,
  sendSessionRequest as requestSession,
  setSessionArchived as archiveSession,
  sessionTranscript,
} from '@botharness/host-client/session-detail';
import type {
  WireBotCompactResult,
  WireSessionStopResult,
  WireStoppedSessionRef,
} from '@botharness/host-protocol/wire';
import { isTurnTarget } from '@botharness/host-protocol/turn-target';
import type { OwnedSessionSummary } from '../../store.js';
import { parseSessionModelRoute } from '../../session-model-route.js';
import type { SessionBotOwner } from '../../bridge.js';

export { parseSessionEngineQuota } from '@botharness/host-client/session-detail';
export type {
  SessionEngine,
  SessionEngineQuota,
  SessionLiveSnapshot,
  SessionToolKind,
  SessionToolTargets,
  SessionTranscript,
  SessionTranscriptEnvelope,
  SessionTranscriptItem,
  SessionTranscriptTrigger,
  SessionTurnUsage,
} from '@botharness/host-client/session-detail';

export function createSessionOwnerBridge(
  isAvatarAppearance: (value: unknown) => value is NonNullable<SessionBotOwner['appearance']>,
) {
  function withAppearance(
    owner: ReturnType<typeof parseSessionOwner>,
  ): SessionBotOwner | undefined {
    if (owner === undefined) return undefined;
    const { appearance, ...fields } = owner;
    return { ...fields, ...(isAvatarAppearance(appearance) ? { appearance } : {}) };
  }

  function parseSessionBotOwner(value: unknown): SessionBotOwner | undefined {
    return withAppearance(parseSessionOwner(value));
  }

  async function loadSessionBotOwner(
    call: BridgeCall,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<SessionBotOwner | undefined> {
    return withAppearance(await sessionOwner(bridgeHost(call, signal), sessionId));
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
  return callSessionModel(bridgeHost(call), slug, sessionId, choice);
}

export function loadSessionTranscript(call: BridgeCall, slug: string, sessionId: string) {
  return sessionTranscript(bridgeHost(call), slug, sessionId);
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
  return parseOwnedSessionSummaries({
    sessions: await ownedSessions(bridgeHost(call, signal), slug),
  });
}

export async function setSessionArchived(
  call: BridgeCall,
  slug: string,
  sessionId: string,
  archived: boolean,
): Promise<boolean> {
  return archiveSession(bridgeHost(call), slug, sessionId, archived);
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

export function sendSessionRequest(
  call: BridgeCall,
  slug: string,
  sessionId: string,
  text: string,
  steer: boolean,
): Promise<void> {
  return requestSession(bridgeHost(call), slug, sessionId, text, steer);
}

export function sendOrchestratorMessage(
  call: BridgeCall,
  botSlug: string,
  sessionId: string,
  text: string,
): Promise<void> {
  return messageOrchestrator(bridgeHost(call), botSlug, sessionId, text);
}
