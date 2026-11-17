export interface SessionFailureProgress {
  completedSteps: number;
  lastTool?: string;
  unknownTools?: string[];
}

export interface SessionFailureAutoContinue {
  attempt: number;
  maxAttempts: number;
  at: string;
}

export function parseFailureProgress(value: unknown): SessionFailureProgress | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const steps = record['completedSteps'];
  if (typeof steps !== 'number' || !Number.isInteger(steps) || steps < 0) return undefined;
  const unknown = Array.isArray(record['unknownTools'])
    ? record['unknownTools'].filter((name): name is string => typeof name === 'string')
    : [];
  return {
    completedSteps: steps,
    ...(typeof record['lastTool'] === 'string' ? { lastTool: record['lastTool'] } : {}),
    ...(unknown.length === 0 ? {} : { unknownTools: unknown }),
  };
}

export function parseFailureAutoContinue(value: unknown): SessionFailureAutoContinue | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const { attempt, maxAttempts, at } = record;
  if (
    typeof attempt !== 'number' ||
    typeof maxAttempts !== 'number' ||
    typeof at !== 'string' ||
    !Number.isFinite(Date.parse(at))
  )
    return undefined;
  return { attempt, maxAttempts, at };
}

export function autoContinueSeconds(
  auto: SessionFailureAutoContinue | undefined,
  now: number,
): number | undefined {
  if (auto === undefined) return undefined;
  const remaining = Date.parse(auto.at) - now;
  return remaining > 0 ? Math.ceil(remaining / 1000) : undefined;
}

export type TurnContinuationNotice = 'busy' | 'changed' | 'unavailable' | 'failed' | 'cancelled';

export interface TurnContinuationPort {
  continueTurn(channelId: string, messageId: string, failureMessageId: string): Promise<unknown>;
  cancelAuto(channelId: string, botSlug: string, requestMessageId: string): Promise<unknown>;
}

export interface TurnContinuationState {
  pending: 'continue' | 'cancel' | undefined;
  settled: boolean;
  cancelled: boolean;
  notice: TurnContinuationNotice | undefined;
}

function noticeFor(error: unknown): TurnContinuationNotice {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === 'bot-busy') return 'busy';
  if (code === 'session-changed') return 'changed';
  if (code === 'retry-unavailable' || code === 'recovery-unavailable' || code === 'not-working')
    return 'unavailable';
  return 'failed';
}

export function createTurnContinuation(
  input: {
    channelId: string | undefined;
    failureMessageId: string;
    botSlug: string | undefined;
    role: 'orchestrator' | 'assignment';
    requestMessageId: string | undefined;
  },
  port: TurnContinuationPort,
) {
  const { channelId, botSlug, requestMessageId, failureMessageId } = input;
  const available =
    input.role === 'orchestrator' &&
    !!botSlug &&
    !!requestMessageId &&
    channelId === `dm-${botSlug}`;
  let state: TurnContinuationState = {
    pending: undefined,
    settled: false,
    cancelled: false,
    notice: undefined,
  };
  const listeners = new Set<() => void>();
  const publish = (next: TurnContinuationState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const act = async (kind: 'continue' | 'cancel') => {
    if (state.pending !== undefined || !available) return;
    publish({ ...state, pending: kind, notice: undefined });
    try {
      if (kind === 'continue') {
        await port.continueTurn(channelId!, requestMessageId!, failureMessageId);
        publish({
          ...state,
          pending: undefined,
          settled: true,
          notice: undefined,
        });
      } else {
        await port.cancelAuto(channelId!, botSlug!, requestMessageId!);
        publish({
          ...state,
          pending: undefined,
          cancelled: true,
          notice: 'cancelled',
        });
      }
    } catch (error) {
      publish({ ...state, pending: undefined, notice: noticeFor(error) });
    }
  };
  return {
    available,
    continueTurn: () => act('continue'),
    cancelAuto: () => act('cancel'),
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const owners = new WeakMap<object, Map<string, ReturnType<typeof createTurnContinuation>>>();
export function turnContinuationFor(
  owner: object,
  input: Parameters<typeof createTurnContinuation>[0],
  port: TurnContinuationPort,
) {
  let cards = owners.get(owner);
  if (!cards) {
    cards = new Map();
    owners.set(owner, cards);
  }
  const key = JSON.stringify([input.channelId, input.failureMessageId]);
  let controller = cards.get(key);
  if (!controller) {
    controller = createTurnContinuation(input, port);
    cards.set(key, controller);
  }
  return controller;
}

const secondListeners = new Set<() => void>();
let secondNow = Date.now();
let secondTimer: ReturnType<typeof setInterval> | undefined;

export function subscribeSeconds(listener: () => void): () => void {
  secondListeners.add(listener);
  if (secondTimer === undefined) {
    secondNow = Date.now();
    secondTimer = setInterval(() => {
      secondNow = Date.now();
      secondListeners.forEach((notify) => notify());
    }, 1000);
  }
  return () => {
    secondListeners.delete(listener);
    if (secondListeners.size > 0 || secondTimer === undefined) return;
    clearInterval(secondTimer);
    secondTimer = undefined;
  };
}

export function readSeconds(): number {
  return secondTimer === undefined ? Math.floor(Date.now() / 1000) * 1000 : secondNow;
}

export function subscribeNever(): () => void {
  return () => undefined;
}
