import {
  ENGINE_QUOTA_WINDOWS,
  type EngineQuotaWindow,
  type EngineQuotaWindowId,
} from '@botharness/host-protocol/subscription-engine';
import {
  isTurnTarget,
  isTurnTargetPath,
  isTurnTargetSwitchReason,
  type TurnModelSwitch,
  type TurnTarget,
} from '@botharness/host-protocol/turn-target';
import { record as asRecord, type HostCall } from './host-answer';

type SessionOwner = {
  botSlug: string;
  displayName: string;
  role: 'orchestrator' | 'assignment';
  avatar?: string;
  avatarSeed?: 2;
  appearance: unknown;
};

export function parseSessionOwner(value: unknown): SessionOwner | undefined {
  const owner = asRecord(asRecord(value)?.['owner']);
  if (owner === undefined) return undefined;
  const { botSlug, displayName, role, avatar, avatarSeed, appearance } = owner;
  if (typeof botSlug !== 'string' || botSlug === '') return undefined;
  if (typeof displayName !== 'string' || displayName === '') return undefined;
  if (role !== 'orchestrator' && role !== 'assignment') return undefined;
  return {
    botSlug,
    displayName,
    role,
    appearance,
    ...(typeof avatar === 'string' && avatar !== '' ? { avatar } : {}),
    ...(avatarSeed === 2 ? { avatarSeed } : {}),
  };
}

export async function sessionOwner(host: HostCall, sessionId: string) {
  return parseSessionOwner(await host.call('sessionOwner', { sessionId }));
}

export async function setSessionArchived(
  host: HostCall,
  slug: string,
  sessionId: string,
  archived: boolean,
): Promise<boolean> {
  const value = asRecord(await host.call('sessionArchiveSet', { slug, sessionId, archived }));
  return value?.['archived'] === true;
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

export function sessionInputPresentation(item: Extract<SessionTranscriptItem, { kind: 'input' }>) {
  if (item.source === 'user')
    return { kind: 'message', text: item.text, envelope: item.envelope?.kind } as const;
  if (item.envelope?.kind === 'inbox') return { kind: 'inbox', text: item.text } as const;
  const skill = /^<skill_content name="([^"]+)">/u.exec(item.text)?.[1];
  if (skill !== undefined) return { kind: 'skill', text: item.text, name: skill } as const;
  return {
    kind: 'trigger',
    text: item.text,
    trigger: item.trigger ?? 'request',
    preview: item.text.split('\n', 1)[0],
  } as const;
}

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
  windows?: Partial<Record<EngineQuotaWindowId, EngineQuotaWindow>>;
  source?: 'live' | 'turn';
}

function parseQuotaWindows(
  value: unknown,
): Partial<Record<EngineQuotaWindowId, EngineQuotaWindow>> | undefined {
  const windows = asRecord(value);
  if (windows === undefined) return undefined;
  const parsed: Partial<Record<EngineQuotaWindowId, EngineQuotaWindow>> = {};
  for (const id of ENGINE_QUOTA_WINDOWS) {
    const window = asRecord(windows[id]);
    if (window === undefined) continue;
    const remaining = window['remainingPercent'];
    const resetsAt = window['resetsAt'];
    const minutes = window['windowMinutes'];
    parsed[id] = {
      ...(typeof remaining === 'number' && Number.isFinite(remaining)
        ? { remainingPercent: Math.min(100, Math.max(0, remaining)) }
        : {}),
      ...(typeof resetsAt === 'string' && Number.isFinite(Date.parse(resetsAt))
        ? { resetsAt }
        : {}),
      ...(typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0
        ? { windowMinutes: minutes }
        : {}),
    };
  }
  return parsed;
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
  const windows = parseQuotaWindows(quota['windows']);
  const source = quota['source'];
  return {
    ...(typeof percent === 'number' && Number.isFinite(percent) ? { usedPercent: percent } : {}),
    ...(resetsAt === undefined ? {} : { resetsAt }),
    ...(limitedUntil === undefined ? {} : { limitedUntil }),
    observedAt: quota['observedAt'],
    ...(windows === undefined ? {} : { windows }),
    ...(source === 'live' || source === 'turn' ? { source } : {}),
  };
}

export interface SessionTranscript {
  role: 'orchestrator' | 'assignment';
  displayTitle?: string;
  items: SessionTranscriptItem[];
  omitted: number;
  running: boolean;
  seq: number;
  engine?: SessionEngine;
  currentTarget?: TurnTarget;
}

export function parseSessionEngine(value: unknown): SessionEngine | undefined {
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

export async function sessionTranscript(
  host: HostCall,
  slug: string,
  sessionId: string,
): Promise<SessionTranscript> {
  const value = asRecord(await host.call('sessionTranscript', { slug, sessionId }));
  const items = value?.['items'];
  if (value === undefined || !Array.isArray(items))
    throw new Error('invalid sessionTranscript response');
  const engine = parseSessionEngine(value['engine']);
  const currentTarget = value['currentTarget'];
  return {
    role: value['role'] === 'orchestrator' ? 'orchestrator' : 'assignment',
    ...(typeof value['displayTitle'] === 'string' && value['displayTitle'].trim() !== ''
      ? { displayTitle: value['displayTitle'] }
      : {}),
    items: parseItems(items),
    omitted: typeof value['omitted'] === 'number' ? value['omitted'] : 0,
    running: value['running'] === true,
    seq: finite(value['seq']) ?? 0,
    ...(engine === undefined ? {} : { engine }),
    ...(isTurnTarget(currentTarget) ? { currentTarget } : {}),
  };
}

export async function sessionLive(
  host: HostCall,
  slug: string,
  sessionId: string,
  after: number | undefined,
): Promise<SessionLiveSnapshot> {
  const value = asRecord(
    await host.call('sessionLive', { slug, sessionId, ...(after === undefined ? {} : { after }) }),
  );
  const items = value?.['items'];
  if (value === undefined || !Array.isArray(items) || typeof value['revision'] !== 'number')
    throw new Error('invalid sessionLive response');
  return {
    revision: value['revision'],
    seq: finite(value['seq']) ?? 0,
    items: parseItems(items).map((item) =>
      item.kind === 'reply' || item.kind === 'reasoning' || item.kind === 'tool'
        ? { ...item, live: true as const }
        : item,
    ),
  };
}

export function mergeLive(
  items: readonly SessionTranscriptItem[],
  live: readonly SessionTranscriptItem[],
): SessionTranscriptItem[] {
  if (live.length === 0) return [...items];
  const known = new Set(items.flatMap((item) => (item.kind === 'tool' ? [item.id] : [])));
  return [...items, ...live.filter((item) => item.kind !== 'tool' || !known.has(item.id))];
}

export async function sendSessionRequest(
  host: HostCall,
  slug: string,
  sessionId: string,
  text: string,
  steer: boolean,
): Promise<void> {
  const value = asRecord(
    await host.call('botToolRun', {
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
  host: HostCall,
  botSlug: string,
  sessionId: string,
  text: string,
): Promise<void> {
  await host.call('sessionMessageSend', { botSlug, sessionId, text });
}
