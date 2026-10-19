import type { DshSessionEvent } from '../sessions/source.js';
import {
  routeKey,
  type IdleCompactionRoute,
  type IdleCompactionSettings,
  type RouteCacheObservation,
} from './idle-compaction-settings.js';

export const MIN_IDLE_MS = 15 * 60 * 1000;
export const DEEPSEEK_DEFAULT_LIFETIME_MS = 2 * 60 * 60 * 1000;
export const SIZE_FLOOR_RATIO = 0.5;
export const WARM_HIT_RATIO = 0.8;
export const COLD_HIT_RATIO = 0.2;
const MIN_SAMPLE_GAP_MS = 60 * 1000;

const CATALOG_PROMPT_CACHE_SECONDS: Readonly<Record<string, number>> = { anthropic: 300 };

export type CacheLifetimeSource = 'setting' | 'catalog' | 'observed' | 'default' | 'unknown';

export interface ResolvedCacheLifetime {
  ms?: number;
  source: CacheLifetimeSource;
}

export interface TokenUsageBuckets {
  uncachedInputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  outputTokens?: number;
}

export function isDeepSeekRoute(route: IdleCompactionRoute): boolean {
  return route.provider === 'deepseek' || route.model.toLowerCase().includes('deepseek');
}

export function resolveCacheLifetime(input: {
  route: IdleCompactionRoute;
  overrides: Readonly<Record<string, number>>;
  observation?: RouteCacheObservation;
}): ResolvedCacheLifetime {
  const override = input.overrides[routeKey(input.route)];
  if (override !== undefined) return { ms: override * 1000, source: 'setting' };
  const catalog = CATALOG_PROMPT_CACHE_SECONDS[input.route.provider];
  if (catalog !== undefined) return { ms: catalog * 1000, source: 'catalog' };
  const fallback = isDeepSeekRoute(input.route) ? DEEPSEEK_DEFAULT_LIFETIME_MS : undefined;
  const warm = input.observation?.warmGapMs;
  let resolved: ResolvedCacheLifetime =
    warm !== undefined && warm >= 2 * MIN_IDLE_MS && (fallback === undefined || warm > fallback)
      ? { ms: warm, source: 'observed' }
      : fallback === undefined
        ? { source: 'unknown' }
        : { ms: fallback, source: 'default' };
  const cold = input.observation?.coldGapMs;
  if (resolved.ms !== undefined && cold !== undefined && cold < resolved.ms)
    resolved = { ms: cold, source: 'observed' };
  return resolved;
}

export function idleCompactionDelayMs(lifetimeMs: number | undefined): number | undefined {
  if (lifetimeMs === undefined || lifetimeMs < MIN_IDLE_MS) return undefined;
  return Math.max(lifetimeMs / 2, MIN_IDLE_MS);
}

export function meetsSizeFloor(tokens: number, thresholdTokens: number): boolean {
  return thresholdTokens > 0 && tokens > thresholdTokens * SIZE_FLOOR_RATIO;
}

export interface CompactionThresholdPolicy {
  thresholdRatio?: number;
  headroomTokens?: number;
  modelPolicies?: ReadonlyArray<{
    provider: string;
    model: string;
    thresholdRatio?: number;
    headroomTokens?: number;
  }>;
}

export function compactionThresholdTokens(
  policy: CompactionThresholdPolicy,
  route: IdleCompactionRoute,
  contextWindow: number,
  reservedCompletionTokens: number,
): number {
  const exact = policy.modelPolicies?.find(
    (entry) => entry.provider === route.provider && entry.model === route.model,
  );
  const ratio = exact?.thresholdRatio ?? policy.thresholdRatio ?? 0.8;
  const headroom = exact?.headroomTokens ?? policy.headroomTokens ?? 65536;
  return Math.floor(
    Math.min(contextWindow * ratio, contextWindow - reservedCompletionTokens - headroom),
  );
}

export function cacheHitRatio(usage: TokenUsageBuckets): number | undefined {
  const read = usage.cacheReadTokens;
  if (read === undefined || usage.uncachedInputTokens === undefined) return undefined;
  const input = read + usage.uncachedInputTokens + (usage.cacheWriteTokens ?? 0);
  return input > 0 ? read / input : undefined;
}

export function observeCacheSample(
  previous: RouteCacheObservation | undefined,
  gapMs: number,
  hitRatio: number,
): RouteCacheObservation | undefined {
  if (gapMs < MIN_SAMPLE_GAP_MS) return undefined;
  const current: RouteCacheObservation = previous ?? { samples: 0 };
  const next: RouteCacheObservation = { ...current, samples: current.samples + 1 };
  if (hitRatio >= WARM_HIT_RATIO) {
    if (next.warmGapMs === undefined || gapMs > next.warmGapMs) next.warmGapMs = gapMs;
    if (next.coldGapMs !== undefined && next.coldGapMs <= next.warmGapMs) delete next.coldGapMs;
  } else if (hitRatio < COLD_HIT_RATIO) {
    if (
      (next.warmGapMs === undefined || gapMs > next.warmGapMs) &&
      (next.coldGapMs === undefined || gapMs < next.coldGapMs)
    )
      next.coldGapMs = gapMs;
  }
  return next.warmGapMs === current.warmGapMs &&
    next.coldGapMs === current.coldGapMs &&
    previous !== undefined
    ? undefined
    : next;
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function usageOf(data: unknown): TokenUsageBuckets | undefined {
  const usage = recordOf(recordOf(data)?.['usage']);
  if (usage === undefined) return undefined;
  const count = (key: string): number | undefined => {
    const value = usage[key];
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? value
      : undefined;
  };
  const buckets: TokenUsageBuckets = {};
  const input = count('inputTokens');
  const read = count('cacheReadTokens');
  const write = count('cacheWriteTokens');
  const output = count('outputTokens');
  if (input !== undefined) buckets.uncachedInputTokens = input;
  if (read !== undefined) buckets.cacheReadTokens = read;
  if (write !== undefined) buckets.cacheWriteTokens = write;
  if (output !== undefined) buckets.outputTokens = output;
  return buckets;
}

function appended(event: DshSessionEvent): boolean {
  return event.surfaceOp === undefined || event.surfaceOp === 'append';
}

export interface IdleCompactionResult {
  summarySeq: number;
}

export class IdleCompactionError extends Error {
  readonly code: string;

  constructor(code: string, message: string = code) {
    super(message);
    this.name = 'IdleCompactionError';
    this.code = code;
  }
}

export interface CompactCommandRunner {
  execute(
    agent: never,
    line: string,
    attachments: readonly never[],
    signal: AbortSignal,
  ): Promise<{ result: { kind: string; text?: string; sourceEventSeq?: number } } | undefined>;
}

const COMPACT_FAILURES: ReadonlyArray<readonly [RegExp, string]> = [
  [/not idle|active compaction/u, 'busy'],
  [/cancelled/u, 'cancelled'],
  [/changed before/u, 'changed'],
  [/useful summary/u, 'summary'],
  [/did not finish cleanly/u, 'commit'],
  [/could not be saved/u, 'persistence'],
];

export async function runCompactCommand(
  commands: CompactCommandRunner,
  agent: unknown,
  signal: AbortSignal,
): Promise<IdleCompactionResult | null> {
  const execution = await commands.execute(agent as never, '/compact', [], signal);
  if (execution === undefined) throw new IdleCompactionError('compact-command-missing');
  const { result } = execution;
  if (result.kind !== 'success') {
    const text = result.text ?? '';
    const code = COMPACT_FAILURES.find(([pattern]) => pattern.test(text))?.[1] ?? 'error';
    throw new IdleCompactionError(code, text);
  }
  return result.sourceEventSeq === undefined ? null : { summarySeq: result.sourceEventSeq };
}

export interface IdleCompactionAgent {
  status: string;
  session: {
    id: string;
    requestHeader():
      | { config: { provider: string; model: string; maxTokens?: number } }
      | undefined;
    snapshotEvents(): readonly DshSessionEvent[];
  };
}

export type IdleCompactionOutcome = 'compacted' | 'nothing' | 'failed';

export interface IdleCompactionRecord {
  botSlug: string;
  at: string;
  provider: string;
  model: string;
  idleGapMs: number;
  cacheLifetimeMs: number;
  cacheLifetimeSource: CacheLifetimeSource;
  tokensBefore: number;
  tokensAfter: number | null;
  outcome: IdleCompactionOutcome;
  error?: string;
  inputTokens: number | null;
  cacheReadTokens: number | null;
  outputTokens: number | null;
}

export interface IdleCompactionPorts<Agent extends IdleCompactionAgent> {
  settings: IdleCompactionSettings;
  orchestratorBot(sessionId: string): string | undefined;
  botBusy(botSlug: string): boolean;
  agent(sessionId: string): Agent | undefined;
  measure(agent: Agent): number | undefined;
  threshold(agent: Agent, route: IdleCompactionRoute): Promise<number | undefined>;
  compactNow(agent: Agent, signal: AbortSignal): Promise<IdleCompactionResult | null>;
  record(record: IdleCompactionRecord): void;
  log(event: Record<string, unknown>): void;
  now?: () => number;
  setTimer?: (task: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface IdleCompactionRouteView {
  provider: string;
  model: string;
  cacheLifetimeSeconds: number | null;
  source: CacheLifetimeSource;
  compactAfterSeconds: number | null;
  overrideSeconds: number | null;
  observedWarmGapSeconds: number | null;
  observedColdGapSeconds: number | null;
}

export interface IdleCompaction {
  observeEvent(sessionId: string, event: DshSessionEvent): void;
  agentStatus(sessionId: string, status: string): void;
  rescan(sessionIds: readonly string[]): void;
  forget(sessionId: string): void;
  describe(routes: readonly IdleCompactionRoute[]): IdleCompactionRouteView[];
  scheduled(): number;
  close(): void;
}

function errorCode(error: unknown): string {
  const code = recordOf(error)?.['code'];
  if (typeof code === 'string' && code.length > 0) return code;
  return error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'error';
}

function seconds(ms: number | undefined): number | null {
  return ms === undefined ? null : Math.round(ms / 1000);
}

export function createIdleCompaction<Agent extends IdleCompactionAgent>(
  ports: IdleCompactionPorts<Agent>,
): IdleCompaction {
  const now = ports.now ?? Date.now;
  const setTimer = ports.setTimer ?? ((task, ms) => setTimeout(task, ms).unref());
  const clearTimer =
    ports.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const lastAnswerAt = new Map<string, number>();
  const pendingGap = new Map<string, number>();
  const done = new Map<string, number>();
  const timers = new Map<string, unknown>();
  const running = new Map<string, AbortController>();
  let closed = false;

  const enabledSettings = () => {
    const value = ports.settings.read();
    return value === 'invalid' || !value.enabled ? undefined : value;
  };

  const cancel = (sessionId: string): void => {
    const timer = timers.get(sessionId);
    if (timer === undefined) return;
    clearTimer(timer);
    timers.delete(sessionId);
  };

  const sample = (route: IdleCompactionRoute, gapMs: number, usage: TokenUsageBuckets): void => {
    const ratio = cacheHitRatio(usage);
    if (ratio === undefined) return;
    const key = routeKey(route);
    const next = observeCacheSample(ports.settings.observations()[key], gapMs, ratio);
    if (next === undefined) return;
    try {
      ports.settings.saveObservation(key, next);
    } catch (error) {
      ports.log({ event: 'observation-save-failed', route: key, error: errorCode(error) });
    }
  };

  const routeOf = (agent: Agent): IdleCompactionRoute | undefined => {
    const config = agent.session.requestHeader()?.config;
    return config === undefined || !config.provider || !config.model
      ? undefined
      : { provider: config.provider, model: config.model };
  };

  const anchorOf = (sessionId: string, agent: Agent): number | undefined => {
    const known = lastAnswerAt.get(sessionId);
    if (known !== undefined) return known;
    return agent.session
      .snapshotEvents()
      .findLast((event) => event.type === 'assistant/message' && appended(event))?.time;
  };

  const lifetime = (route: IdleCompactionRoute, overrides: Record<string, number>) =>
    resolveCacheLifetime({
      route,
      overrides,
      ...(ports.settings.observations()[routeKey(route)] === undefined
        ? {}
        : { observation: ports.settings.observations()[routeKey(route)]! }),
    });

  const run = async (sessionId: string, anchor: number): Promise<void> => {
    timers.delete(sessionId);
    if (closed || running.has(sessionId)) return;
    const settings = enabledSettings();
    const botSlug = ports.orchestratorBot(sessionId);
    const agent = ports.agent(sessionId);
    if (settings === undefined || botSlug === undefined || agent === undefined) return;
    const idle = () =>
      agent.status === 'idle' &&
      !ports.botBusy(botSlug) &&
      anchorOf(sessionId, agent) === anchor &&
      !closed;
    if (!idle()) return;
    const route = routeOf(agent);
    if (route === undefined) return;
    const resolved = lifetime(route, settings.cacheLifetimes);
    const idleGapMs = now() - anchor;
    if (resolved.ms === undefined || idleGapMs >= resolved.ms) {
      done.set(sessionId, anchor);
      ports.log({ event: 'skipped', reason: 'cache-cold', botSlug, route: routeKey(route) });
      return;
    }
    const tokensBefore = ports.measure(agent);
    let threshold: number | undefined;
    try {
      threshold = await ports.threshold(agent, route);
    } catch (error) {
      ports.log({ event: 'skipped', reason: 'threshold-unavailable', error: errorCode(error) });
    }
    if (tokensBefore === undefined || threshold === undefined) {
      ports.log({
        event: 'skipped',
        reason: 'measure-unavailable',
        botSlug,
        route: routeKey(route),
      });
      return;
    }
    if (!meetsSizeFloor(tokensBefore, threshold)) {
      done.set(sessionId, anchor);
      ports.log({
        event: 'skipped',
        reason: 'below-size-floor',
        botSlug,
        route: routeKey(route),
        tokens: tokensBefore,
        threshold,
      });
      return;
    }
    if (!idle()) return;
    done.set(sessionId, anchor);
    const controller = new AbortController();
    running.set(sessionId, controller);
    const base = {
      botSlug,
      at: new Date(now()).toISOString(),
      provider: route.provider,
      model: route.model,
      idleGapMs,
      cacheLifetimeMs: resolved.ms,
      cacheLifetimeSource: resolved.source,
      tokensBefore,
    };
    ports.log({ event: 'started', botSlug, route: routeKey(route), idleGapMs, tokensBefore });
    let record: IdleCompactionRecord;
    try {
      const result = await ports.compactNow(agent, controller.signal);
      const summary =
        result === null
          ? undefined
          : agent.session
              .snapshotEvents()
              .findLast(
                (event) => event.seq === result.summarySeq && event.type === 'compaction/summary',
              );
      const usage = summary === undefined ? undefined : usageOf(summary.data);
      if (usage !== undefined) sample(route, idleGapMs, usage);
      record = {
        ...base,
        tokensAfter: ports.measure(agent) ?? null,
        outcome: result === null ? 'nothing' : 'compacted',
        inputTokens:
          usage?.uncachedInputTokens === undefined
            ? null
            : usage.uncachedInputTokens + (usage.cacheWriteTokens ?? 0),
        cacheReadTokens: usage?.cacheReadTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
      };
    } catch (error) {
      record = {
        ...base,
        tokensAfter: null,
        outcome: 'failed',
        error: errorCode(error),
        inputTokens: null,
        cacheReadTokens: null,
        outputTokens: null,
      };
    } finally {
      running.delete(sessionId);
    }
    ports.log({
      event: 'finished',
      botSlug,
      outcome: record.outcome,
      tokensBefore,
      tokensAfter: record.tokensAfter,
      ...(record.error === undefined ? {} : { error: record.error }),
    });
    try {
      ports.record(record);
    } catch (error) {
      ports.log({ event: 'record-failed', botSlug, error: errorCode(error) });
    }
  };

  const schedule = (sessionId: string): void => {
    cancel(sessionId);
    if (closed || running.has(sessionId)) return;
    const settings = enabledSettings();
    if (settings === undefined || ports.orchestratorBot(sessionId) === undefined) return;
    const agent = ports.agent(sessionId);
    if (agent === undefined || agent.status !== 'idle') return;
    const anchor = anchorOf(sessionId, agent);
    if (anchor === undefined || done.get(sessionId) === anchor) return;
    const route = routeOf(agent);
    if (route === undefined) return;
    const resolved = lifetime(route, settings.cacheLifetimes);
    const delay = idleCompactionDelayMs(resolved.ms);
    if (delay === undefined) {
      done.set(sessionId, anchor);
      return;
    }
    const wait = Math.max(0, anchor + delay - now());
    timers.set(
      sessionId,
      setTimer(() => {
        void run(sessionId, anchor).catch((error: unknown) =>
          ports.log({ event: 'run-failed', error: errorCode(error) }),
        );
      }, wait),
    );
  };

  return {
    observeEvent(sessionId, event) {
      if (event.type === 'compaction/end') {
        lastAnswerAt.delete(sessionId);
        pendingGap.delete(sessionId);
        return;
      }
      if (!appended(event)) return;
      if (event.type === 'user/message') {
        cancel(sessionId);
        const last = lastAnswerAt.get(sessionId);
        if (last !== undefined && !pendingGap.has(sessionId))
          pendingGap.set(sessionId, event.time - last);
        return;
      }
      if (event.type !== 'assistant/message') return;
      cancel(sessionId);
      lastAnswerAt.set(sessionId, event.time);
      const gap = pendingGap.get(sessionId);
      pendingGap.delete(sessionId);
      if (gap === undefined) return;
      const usage = usageOf(event.data);
      const agent = ports.agent(sessionId);
      const route = agent === undefined ? undefined : routeOf(agent);
      if (usage !== undefined && route !== undefined) sample(route, gap, usage);
    },
    agentStatus(sessionId, status) {
      if (status === 'idle') schedule(sessionId);
      else cancel(sessionId);
    },
    rescan(sessionIds) {
      for (const sessionId of sessionIds) schedule(sessionId);
    },
    forget(sessionId) {
      cancel(sessionId);
      running.get(sessionId)?.abort();
      lastAnswerAt.delete(sessionId);
      pendingGap.delete(sessionId);
      done.delete(sessionId);
    },
    describe(routes) {
      const value = ports.settings.read();
      const overrides = value === 'invalid' ? {} : value.cacheLifetimes;
      const keys = new Map<string, IdleCompactionRoute>();
      const add = (route: IdleCompactionRoute) => keys.set(routeKey(route), route);
      for (const route of routes) add(route);
      for (const key of [
        ...Object.keys(overrides),
        ...Object.keys(ports.settings.observations()),
      ]) {
        const slash = key.indexOf('/');
        if (slash > 0) add({ provider: key.slice(0, slash), model: key.slice(slash + 1) });
      }
      return [...keys.values()]
        .sort((left, right) => routeKey(left).localeCompare(routeKey(right)))
        .map((route) => {
          const resolved = lifetime(route, overrides);
          const observation = ports.settings.observations()[routeKey(route)];
          return {
            provider: route.provider,
            model: route.model,
            cacheLifetimeSeconds: seconds(resolved.ms),
            source: resolved.source,
            compactAfterSeconds: seconds(idleCompactionDelayMs(resolved.ms)),
            overrideSeconds: overrides[routeKey(route)] ?? null,
            observedWarmGapSeconds: seconds(observation?.warmGapMs),
            observedColdGapSeconds: seconds(observation?.coldGapMs),
          };
        });
    },
    scheduled() {
      return timers.size;
    },
    close() {
      closed = true;
      for (const timer of timers.values()) clearTimer(timer);
      timers.clear();
      for (const controller of running.values()) controller.abort();
    },
  };
}
