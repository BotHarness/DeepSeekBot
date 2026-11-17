import { sessionMaintenanceFor } from './shared/session-maintenance';
import {
  parseFailureAutoContinue,
  parseFailureProgress,
  turnContinuationFor,
  type SessionFailureAutoContinue,
  type SessionFailureProgress,
} from './shared/turn-continuation';
export { latestTurnMessageId } from '../../core/src/channels/channel-notice';
export interface SessionFailure {
  role: 'orchestrator' | 'assignment';
  sessionId: string;
  detail: string;
  requestMessageId?: string;
  code?: string;
  progress?: SessionFailureProgress;
  autoContinue?: SessionFailureAutoContinue;
  repeated?: number;
}

export function sessionFailure(value: unknown): SessionFailure | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    !('role' in value) ||
    (value.role !== 'orchestrator' && value.role !== 'assignment') ||
    !('sessionId' in value) ||
    typeof value.sessionId !== 'string' ||
    !value.sessionId ||
    !('detail' in value) ||
    typeof value.detail !== 'string'
  )
    return undefined;
  return {
    role: value.role,
    sessionId: value.sessionId,
    detail: value.detail,
    ...('requestMessageId' in value &&
    typeof value.requestMessageId === 'string' &&
    value.requestMessageId
      ? { requestMessageId: value.requestMessageId }
      : {}),
    ...('code' in value && typeof value.code === 'string' ? { code: value.code } : {}),
    ...withParsed(
      'progress',
      parseFailureProgress('progress' in value ? value.progress : undefined),
    ),
    ...withParsed(
      'autoContinue',
      parseFailureAutoContinue('autoContinue' in value ? value.autoContinue : undefined),
    ),
  };
}

function withParsed<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}

export function createFailureContinuation(
  client: {
    call(method: string, args: Record<string, unknown>): Promise<unknown>;
  },
  channelId: string,
  failureMessageId: string,
  failure: SessionFailure,
) {
  const slug = channelId.startsWith('dm-') ? channelId.slice(3) : undefined;
  return turnContinuationFor(
    client,
    {
      channelId,
      failureMessageId,
      botSlug: slug,
      role: failure.role,
      requestMessageId: failure.requestMessageId,
    },
    {
      continueTurn: (channel, messageId, failureId) =>
        client.call('channelRetry', {
          channelId: channel,
          messageId,
          recovery: 'continue',
          failureMessageId: failureId,
        }),
      cancelAuto: (channel, botSlug, messageId) =>
        client.call('botStop', {
          channelId: channel,
          botSlug,
          autoContinueFor: messageId,
        }),
    },
  );
}

export function createFailureMaintenance(
  client: {
    call(method: string, args: Record<string, unknown>): Promise<unknown>;
  },
  channelId: string,
  failure: SessionFailure,
) {
  const slug =
    failure.role === 'orchestrator' && channelId.startsWith('dm-') ? channelId.slice(3) : undefined;
  return sessionMaintenanceFor(client, channelId, slug, {
    compact: (slug) => client.call('botCompact', { slug }),
    newSession: (slug) => client.call('botNewSession', { slug }),
  });
}

interface RepeatableFailure {
  role: string;
  code?: string;
  detail: string;
  progress?: SessionFailureProgress;
  repeated?: number;
}

function sameFailure(a: RepeatableFailure, b: RepeatableFailure): boolean {
  const progressed = (failure: RepeatableFailure) =>
    failure.progress !== undefined &&
    (failure.progress.completedSteps > 0 || failure.progress.lastTool !== undefined);
  if (progressed(a) || progressed(b) || a.role !== b.role) return false;
  return a.code !== undefined || b.code !== undefined ? a.code === b.code : a.detail === b.detail;
}

export function collapseRepeatedFailures<T>(
  items: readonly T[],
  read: (item: T) => { bot: string | undefined; failure: RepeatableFailure | undefined },
  annotate: (item: T, repeated: number) => T,
  pinned: (item: T) => boolean = () => false,
): readonly T[] {
  const shown: T[] = [];
  let collapsed = false;
  let previous:
    | { bot: string | undefined; failure: RepeatableFailure; count: number; pinned: boolean }
    | undefined;
  for (const item of items) {
    const { bot, failure } = read(item);
    if (
      failure !== undefined &&
      previous !== undefined &&
      !previous.pinned &&
      bot !== undefined &&
      bot === previous.bot &&
      sameFailure(previous.failure, failure)
    ) {
      const count = previous.count + (failure.repeated ?? 1);
      shown[shown.length - 1] = annotate(item, count);
      previous = { bot, failure, count, pinned: pinned(item) };
      collapsed = true;
      continue;
    }
    shown.push(item);
    previous =
      failure === undefined
        ? undefined
        : { bot, failure, count: failure.repeated ?? 1, pinned: pinned(item) };
  }
  return collapsed ? shown : items;
}
