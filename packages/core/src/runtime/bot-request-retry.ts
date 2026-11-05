import type { RequestErrorAction } from '@deepseek-ai/dsh-agent';

export const CONCURRENCY_WAIT_MS = 300_000;
const INITIAL_DELAY_MS = 1_000;
const MAX_DELAY_MS = 10_000;
const MAX_PROVIDER_DELAY_MS = 60_000;
const JITTER_RATIO = 0.2;
const CONCURRENCY_TEXT =
  /concurren(?:cy|t)[\w\s]{0,24}(?:limit|exceed)|too many (?:concurrent )?requests|server (?:is )?(?:busy|overloaded)/i;
const NEVER_RETRIED = new Set([
  'AUTH',
  'INVALID_CREDENTIAL',
  'MISSING_CREDENTIAL',
  'QUOTA_EXCEEDED',
  'CONTEXT_WINDOW_EXCEEDED',
  'ABORTED',
]);

export interface RequestFailure {
  readonly code: string;
  readonly message: string;
  readonly providerRetryAfterMs?: number;
}

export interface RequestErrorPayload {
  readonly agent: { readonly session: { readonly id: string } };
  readonly turn: number;
  readonly step: number;
  readonly provider: string;
  readonly failure: RequestFailure;
  readonly retryPolicy?: { readonly mode: string } | undefined;
  readonly signal: AbortSignal;
}

export interface BotRequestRetryOptions {
  isBotSession(sessionId: string): boolean;
  log?(message: string): void;
  waitMs?: number;
  now?(): number;
  random?(): number;
  sleep?(ms: number, signal: AbortSignal): Promise<boolean>;
}

export function isConcurrencyRefusal(failure: RequestFailure): boolean {
  if (NEVER_RETRIED.has(failure.code)) return false;
  return failure.code === 'RATE_LIMIT' || CONCURRENCY_TEXT.test(failure.message);
}

function cancellableSleep(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      resolve(false);
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function createBotRequestRetry(options: BotRequestRetryOptions) {
  const waitMs = options.waitMs ?? CONCURRENCY_WAIT_MS;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? cancellableSleep;
  const waits = new Map<string, { turn: number; step: number; since: number; retry: number }>();

  return async (
    payload: RequestErrorPayload,
    next: () => Promise<RequestErrorAction>,
  ): Promise<RequestErrorAction> => {
    const sessionId = payload.agent.session.id;
    if (
      payload.retryPolicy?.mode === 'always' ||
      !isConcurrencyRefusal(payload.failure) ||
      !options.isBotSession(sessionId)
    )
      return next();
    const previous = waits.get(sessionId);
    const wait =
      previous !== undefined && previous.turn === payload.turn && previous.step === payload.step
        ? previous
        : { turn: payload.turn, step: payload.step, since: now(), retry: 0 };
    const retry = wait.retry + 1;
    const exponential = Math.min(INITIAL_DELAY_MS * 2 ** Math.min(retry - 1, 16), MAX_DELAY_MS);
    const providerDelay = payload.failure.providerRetryAfterMs;
    const delayMs =
      providerDelay !== undefined &&
      Number.isFinite(providerDelay) &&
      providerDelay > 0 &&
      providerDelay <= MAX_PROVIDER_DELAY_MS
        ? providerDelay
        : exponential * (1 - JITTER_RATIO + 2 * JITTER_RATIO * random());
    const waited = now() - wait.since;
    if (waited + delayMs > waitMs) {
      waits.delete(sessionId);
      options.log?.(
        `botharness: model request still refused after ${Math.round(waited / 1000)} s and ${wait.retry} retries; provider=${payload.provider} code=${payload.failure.code}`,
      );
      return next();
    }
    waits.set(sessionId, { ...wait, retry });
    options.log?.(
      `botharness: model request refused by concurrency limit; retry ${retry} in ${Math.round(delayMs)} ms; provider=${payload.provider} code=${payload.failure.code}`,
    );
    if (!(await sleep(delayMs, payload.signal))) {
      waits.delete(sessionId);
      return undefined;
    }
    return { kind: 'retry' };
  };
}
