import type { Context } from '@deepseek-ai/cordis';
import { join } from 'node:path';
import { clientObserverScript, type ClientDiagnosticEvent } from './client-observer.js';
import { openLogDatabase, type LogDatabase, type LogEntryInput } from '../logs/log-db.js';

export const CLIENT_DIAGNOSTICS_PATH = '/api/botharness/client-diagnostics';
const CODES = new Set([
  'remote-notification-show-refused',
  'remote-notification-show-failed',
  'observation-deferred',
  'resource-load-failed',
  'observer-installed',
  'shell-mounted',
  'shell-lost',
  'shell-timeout',
  'page-hidden',
  'root-registration-missing',
  'conversation-session-missing',
  'client-runner-failed',
  'connection-lost',
  'unclassified-exception',
]);
const SOURCES = new Set([
  'lifecycle',
  'console-error',
  'console-warn',
  'error',
  'unhandledrejection',
]);
const FAILURE_CODES = new Set([
  'shell-lost',
  'shell-timeout',
  'resource-load-failed',
  'root-registration-missing',
  'conversation-session-missing',
  'client-runner-failed',
  'unclassified-exception',
]);

function isFailure(event: ClientDiagnosticEvent): boolean {
  return (
    FAILURE_CODES.has(event.code) ||
    event.source === 'error' ||
    event.source === 'unhandledrejection' ||
    event.source === 'console-error'
  );
}

function eventOf(value: unknown): ClientDiagnosticEvent | undefined {
  if (typeof value !== 'object' || value === null) return;
  const v = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(v.seq) ||
    (v.seq as number) < 1 ||
    !Number.isSafeInteger(v.elapsedMs) ||
    (v.elapsedMs as number) < 0 ||
    typeof v.code !== 'string' ||
    !CODES.has(v.code) ||
    typeof v.source !== 'string' ||
    !SOURCES.has(v.source)
  )
    return;
  return {
    seq: v.seq as number,
    elapsedMs: v.elapsedMs as number,
    source: v.source as ClientDiagnosticEvent['source'],
    code: v.code,
  };
}

interface Attempt {
  attempt: string;
  startedAt: number;
  receivedAt: number;
  events: ClientDiagnosticEvent[];
  dropped: number;
  firstFailure?: ClientDiagnosticEvent;
  shellMounted?: ClientDiagnosticEvent;
  lastSeq: number;
}

export function injectClientObserver(html: string): string {
  const script = `<script data-botharness-client-diagnostics>${clientObserverScript()}</script>`;
  const firstScript = html.search(/<script\b/iu);
  if (firstScript >= 0) return html.slice(0, firstScript) + script + html.slice(firstScript);
  return html.replace(/<head\b[^>]*>/iu, (head) => head + script);
}

export function createClientDiagnostics(
  options: {
    now?: () => number;
    write?: (entry: LogEntryInput) => void;
    persistence?: 'available' | 'unavailable';
  } = {},
) {
  const now = options.now ?? Date.now;
  const attempts = new Map<string, Attempt>();
  let evicted = 0;
  let persistence = options.persistence ?? (options.write ? 'available' : 'unavailable');
  const write = (attempt: Attempt, event: ClientDiagnosticEvent): void => {
    try {
      options.write?.({
        plugin: 'client-diagnostics',
        owner: 'profile-shared',
        kind: 'client-observation',
        traceId: attempt.attempt,
        detail: JSON.stringify({
          version: 1,
          attempt: attempt.attempt,
          startedAt: attempt.startedAt,
          ...event,
        }),
      });
    } catch {
      persistence = 'unavailable';
    }
  };
  const json = (value: unknown, status = 200) =>
    Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
  return {
    async fetch(request: Request): Promise<Response> {
      if (request.method === 'GET')
        return json({
          version: 1,
          evidence: 'browser-reported',
          readiness: attempts.size ? 'inspect-attempts' : 'unobserved',
          persistence,
          evictedAttempts: evicted,
          attempts: [...attempts.values()].map((a) => ({
            ...a,
            state: a.firstFailure
              ? 'failed'
              : now() - a.receivedAt > 35000
                ? 'stale'
                : a.events.at(-1)?.code === 'page-hidden'
                  ? 'closed'
                  : a.shellMounted
                    ? 'shell-ready'
                    : 'starting',
          })),
        });
      if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);
      const body = await request.text();
      if (body.length > 16000) return json({ error: 'report-too-large' }, 413);
      let value: unknown;
      try {
        value = JSON.parse(body);
      } catch {
        return json({ error: 'invalid-report' }, 400);
      }
      if (typeof value !== 'object' || value === null)
        return json({ error: 'invalid-report' }, 400);
      const v = value as Record<string, unknown>;
      if (
        v.version !== 1 ||
        typeof v.attempt !== 'string' ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(v.attempt) ||
        !Number.isSafeInteger(v.startedAt) ||
        (v.startedAt as number) < 0 ||
        !Number.isSafeInteger(v.dropped) ||
        (v.dropped as number) < 0 ||
        !Array.isArray(v.events) ||
        v.events.length < 1 ||
        v.events.length > 64
      )
        return json({ error: 'invalid-report' }, 400);
      const events: ClientDiagnosticEvent[] = [];
      for (const raw of v.events) {
        const event = eventOf(raw);
        if (
          !event ||
          event.seq <= (events.at(-1)?.seq ?? 0) ||
          event.elapsedMs < (events.at(-1)?.elapsedMs ?? 0)
        )
          return json({ error: 'invalid-report' }, 400);
        events.push(event);
      }
      const suppliedFailure = v.firstFailure === undefined ? undefined : eventOf(v.firstFailure);
      if (
        v.firstFailure !== undefined &&
        (!suppliedFailure ||
          !isFailure(suppliedFailure) ||
          suppliedFailure.seq > events.at(-1)!.seq ||
          suppliedFailure.elapsedMs > events.at(-1)!.elapsedMs)
      )
        return json({ error: 'invalid-report' }, 400);
      const suppliedMount = v.shellMounted === undefined ? undefined : eventOf(v.shellMounted);
      if (
        v.shellMounted !== undefined &&
        (!suppliedMount ||
          suppliedMount.code !== 'shell-mounted' ||
          suppliedMount.source !== 'lifecycle' ||
          suppliedMount.seq > events.at(-1)!.seq ||
          suppliedMount.elapsedMs > events.at(-1)!.elapsedMs)
      )
        return json({ error: 'invalid-report' }, 400);
      let attempt = attempts.get(v.attempt);
      if (attempt && attempt.startedAt !== v.startedAt)
        return json({ error: 'attempt-conflict' }, 409);
      if (!attempt) {
        if (attempts.size >= 20) {
          const oldest = attempts.keys().next().value;
          if (oldest !== undefined) attempts.delete(oldest);
          evicted += 1;
        }
        attempt = {
          attempt: v.attempt,
          startedAt: v.startedAt as number,
          receivedAt: now(),
          events: [],
          dropped: 0,
          lastSeq: 0,
        };
        attempts.set(attempt.attempt, attempt);
      }
      const lastSeq = events.at(-1)!.seq;
      if (lastSeq < attempt.lastSeq || (v.dropped as number) < attempt.dropped)
        return json({ error: 'out-of-order-report' }, 409);
      const first = [attempt.firstFailure, suppliedFailure, ...events.filter(isFailure)]
        .filter((e): e is ClientDiagnosticEvent => e !== undefined)
        .sort((a, b) => a.seq - b.seq)[0];
      if (first) attempt.firstFailure = first;
      const mount = [
        attempt.shellMounted,
        suppliedMount,
        ...events.filter((event) => event.code === 'shell-mounted' && event.source === 'lifecycle'),
      ]
        .filter((event): event is ClientDiagnosticEvent => event !== undefined)
        .sort((a, b) => a.seq - b.seq)[0];
      if (mount) attempt.shellMounted = mount;
      const pending = events.filter((event) => event.seq > attempt!.lastSeq);
      if (mount && mount.seq > attempt.lastSeq && !pending.some((event) => event.seq === mount.seq))
        pending.push(mount);
      if (first && first.seq > attempt.lastSeq && !pending.some((event) => event.seq === first.seq))
        pending.push(first);
      pending.sort((a, b) => a.seq - b.seq);
      for (const event of pending) write(attempt, event);
      attempt.events = events;
      attempt.dropped = v.dropped as number;
      attempt.lastSeq = lastSeq;
      attempt.receivedAt = now();
      return json({ ok: true });
    },
    dispose(): void {
      attempts.clear();
    },
  };
}

export function mountClientDiagnostics(ctx: Context, home: string): void {
  if (process.env['BOTHARNESS_CLIENT_DIAGNOSTICS'] !== '1') return;
  ctx.inject(['webServer', 'connection'], (child) => {
    const services = child as unknown as {
      webServer: { tapIndex(transform: (html: string) => string): () => void };
      connection: {
        fetch: {
          register(route: {
            path: string;
            methods: readonly ('GET' | 'POST')[];
            requestBody: 'buffered';
            fetch(request: Request): Promise<Response>;
          }): () => Promise<void>;
        };
      };
    };
    child.effect(() => {
      let database: LogDatabase | undefined;
      try {
        database = openLogDatabase({ dir: join(home, 'botharness') });
      } catch {
        child.logger.warn('client-diagnostics phase=persistence-unavailable');
      }
      const diagnostics = createClientDiagnostics({
        persistence: database ? 'available' : 'unavailable',
        ...(database ? { write: (entry: LogEntryInput) => database!.write(entry) } : {}),
      });
      const offIndex = services.webServer.tapIndex(injectClientObserver);
      const offRoute = services.connection.fetch.register({
        path: CLIENT_DIAGNOSTICS_PATH,
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: diagnostics.fetch,
      });
      return async () => {
        offIndex();
        await offRoute();
        diagnostics.dispose();
        database?.close();
      };
    }, 'botharness: opt-in early Client diagnostic evidence');
  });
}
