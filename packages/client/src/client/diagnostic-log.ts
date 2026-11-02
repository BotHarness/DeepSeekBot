export const CLIENT_LOG_ENDPOINT = './api/botharness/client-log';
export const DIAGNOSTIC_LOGS_ENDPOINT = './api/botharness/diagnostic-logs';

export type ClientLogCategory =
  | 'action'
  | 'navigation'
  | 'error'
  | 'perf'
  | 'invariant'
  | 'lifecycle'
  | 'network';
export type ClientLogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ClientLogValue = string | number | boolean | null;
export type ClientLogFields = Record<string, ClientLogValue>;

interface ClientLogEntry {
  ts: number;
  category: ClientLogCategory;
  level: ClientLogLevel;
  code: string;
  fields?: ClientLogFields;
}

const MAX_PENDING = 400;
const MAX_BATCH = 100;
const MAX_BATCH_CHARS = 48 * 1024;
const FLUSH_MS = 3000;
const URGENT_FLUSH_MS = 250;
const MAX_TEXT = 300;
const MAX_LABEL = 80;
const MAX_PLAIN_LABEL = 40;
const REPEAT_WINDOW_MS = 10_000;
const LONG_TASK_MS = 200;
const SLOW_RPC_MS = 1500;
const HEARTBEAT_MS = 5 * 60_000;

function text(value: string, max = MAX_TEXT): string {
  const flat = value.replace(/\s+/gu, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function code(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 64) || 'unknown'
  );
}

export function clientLogFields(input: unknown, prefix = '', depth = 0): ClientLogFields {
  const out: ClientLogFields = {};
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const name = prefix + key.replace(/[^\w.-]/gu, '_');
    if (!/^[A-Za-z]/u.test(name)) continue;
    if (typeof value === 'string') out[name] = text(value);
    else if (typeof value === 'number') {
      if (Number.isFinite(value)) out[name] = Math.round(value * 1000) / 1000;
    } else if (typeof value === 'boolean' || value === null) out[name] = value;
    else if (typeof value === 'object' && depth < 1)
      Object.assign(out, clientLogFields(value, `${name}.`, depth + 1));
    if (Object.keys(out).length >= 24) break;
  }
  return out;
}

function errorFields(error: unknown): ClientLogFields {
  if (error instanceof Error) {
    const stack = (error.stack ?? '')
      .split('\n')
      .filter((line) => /^\s*at\s|@/u.test(line))
      .slice(0, 6)
      .map((line) => line.trim().replace(/https?:\/\/[^/\s)]+/gu, ''))
      .join(' | ');
    return {
      name: text(error.name, 64),
      message: text(error.message),
      ...(stack === '' ? {} : { stack: text(stack) }),
    };
  }
  return { message: text(String(error)) };
}

function consoleText(args: readonly unknown[]): { message: string; fields: ClientLogFields } {
  let message = '';
  let fields: ClientLogFields = {};
  for (const arg of args.slice(0, 4)) {
    if (typeof arg === 'string') message += (message ? ' ' : '') + arg;
    else if (arg instanceof Error) {
      const details = errorFields(arg);
      message += (message ? ' ' : '') + String(details['message'] ?? '');
      if (details['stack'] !== undefined) fields['stack'] = details['stack'];
    } else if (Object.keys(fields).length === 0) fields = clientLogFields(arg);
  }
  return { message: text(message), fields };
}

function batchSize(entries: readonly ClientLogEntry[]): number {
  let chars = 0;
  let count = 0;
  for (const entry of entries) {
    chars += JSON.stringify(entry).length + 1;
    if (count > 0 && (count >= MAX_BATCH || chars > MAX_BATCH_CHARS)) break;
    count += 1;
  }
  return count;
}

function roleOf(element: Element): string {
  return element.getAttribute('role') ?? element.tagName.toLowerCase();
}

function plainLabel(control: Element): string {
  if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) return '';
  if (control.children.length > 0) return '';
  const label = control.textContent?.trim() ?? '';
  return label.length <= MAX_PLAIN_LABEL ? label : '';
}

export function describeControl(element: Element): ClientLogFields | undefined {
  const control = element.closest(
    'button, a[href], [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="tab"], [role="switch"], [role="option"], [role="checkbox"], [role="radio"], [role="treeitem"], [role="link"], summary, input[type="checkbox"], input[type="radio"], select',
  );
  if (control === null) return;
  const label = control.getAttribute('aria-label') ?? plainLabel(control);
  const hook = [...control.classList].find((name) => name.startsWith('bh-'));
  const tour = control.getAttribute('data-bh-tour');
  const testId = control.getAttribute('data-testid');
  const dialog = control.closest('[role="dialog"]');
  const dialogLabel = dialog?.getAttribute('aria-label') ?? undefined;
  return {
    role: roleOf(control),
    ...(label.trim() === '' ? {} : { label: text(label, MAX_LABEL) }),
    ...(hook === undefined ? {} : { hook }),
    ...(tour === null ? {} : { tour }),
    ...(testId === null ? {} : { testId }),
    ...(dialogLabel === undefined ? {} : { dialog: text(dialogLabel, MAX_LABEL) }),
    ...(control.getAttribute('aria-pressed') === null
      ? {}
      : { pressed: control.getAttribute('aria-pressed') }),
  };
}

function shortcutOf(event: KeyboardEvent): string | undefined {
  const named = ['Escape', 'Enter', 'Tab', 'F1', 'F5', 'F12'];
  const modified = event.metaKey || event.ctrlKey || event.altKey;
  if (!modified && !named.includes(event.key)) return;
  if (!modified && event.key === 'Tab') return;
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) return;
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return [
    event.metaKey ? 'Meta' : '',
    event.ctrlKey ? 'Ctrl' : '',
    event.altKey ? 'Alt' : '',
    event.shiftKey ? 'Shift' : '',
    key,
  ]
    .filter(Boolean)
    .join('+');
}

export interface ClientLogRecorder {
  readonly session: string;
  record(
    category: ClientLogCategory,
    eventCode: string,
    fields?: ClientLogFields,
    level?: ClientLogLevel,
  ): void;
  invariant(eventCode: string, message: string, fields?: unknown): void;
  timeRpc<T>(
    endpoint: string,
    run: () => Promise<T>,
    failed?: (result: T) => string | undefined,
  ): Promise<T>;
  flush(): Promise<void>;
  dispose(): void;
}

export interface ClientLogRecorderOptions {
  window?: (Window & typeof globalThis) | undefined;
  fetch?: typeof fetch;
  now?: () => number;
  surface?: string;
}

function uuid(win: (Window & typeof globalThis) | undefined): string {
  try {
    if (win?.crypto?.randomUUID) return win.crypto.randomUUID();
  } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createClientLogRecorder(options: ClientLogRecorderOptions = {}): ClientLogRecorder {
  const win = options.window;
  const send = options.fetch ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
  const now = options.now ?? Date.now;
  const session = uuid(win);
  let pending: ClientLogEntry[] = [];
  let dropped = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sending: Promise<void> | undefined;
  let failures = 0;
  let disposed = false;
  let quiet = 0;
  const repeats = new Map<string, { at: number; count: number }>();
  const cleanups: Array<() => void> = [];

  const schedule = (delay: number): void => {
    if (disposed || send === undefined) return;
    if (timer !== undefined) {
      if (delay >= FLUSH_MS) return;
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, delay);
  };

  const flush = async (keepalive = false): Promise<void> => {
    if (send === undefined) return;
    if (sending !== undefined) {
      await sending;
      if (pending.length === 0) return;
    }
    if (pending.length === 0) return;
    const entries = pending.slice(0, batchSize(pending));
    pending = pending.slice(entries.length);
    const lost = dropped;
    dropped = 0;
    sending = (async () => {
      try {
        const response = await send(CLIENT_LOG_ENDPOINT, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ version: 1, session, dropped: lost, entries }),
          keepalive,
        });
        await response.text().catch(() => '');
        if (
          !response.ok &&
          response.status !== 400 &&
          !(response.status === 413 && entries.length === 1)
        )
          throw new Error(`diagnostic log refused: ${response.status}`);
        failures = 0;
      } catch {
        failures += 1;
        if (failures <= 5) {
          pending = [...entries, ...pending].slice(-MAX_PENDING);
          dropped += lost;
        } else dropped += lost + entries.length;
      } finally {
        sending = undefined;
      }
    })();
    await sending;
    if (pending.length > 0) schedule(failures > 0 ? Math.min(60_000, FLUSH_MS * 2 ** failures) : 0);
  };

  const record: ClientLogRecorder['record'] = (category, eventCode, fields, level) => {
    if (disposed) return;
    const at = now();
    const name = code(eventCode);
    const resolved =
      level ?? (category === 'error' ? 'error' : category === 'invariant' ? 'warn' : 'info');
    if (resolved === 'error' || resolved === 'warn') {
      const key = `${category}:${name}:${String(fields?.['message'] ?? '')}`;
      const seen = repeats.get(key);
      if (seen !== undefined && at - seen.at < REPEAT_WINDOW_MS) {
        seen.count += 1;
        return;
      }
      if (seen !== undefined && seen.count > 0)
        pending.push({
          ts: at,
          category,
          level: resolved,
          code: name,
          fields: { ...fields, repeated: seen.count },
        });
      repeats.set(key, { at, count: 0 });
      if (repeats.size > 200) repeats.delete(repeats.keys().next().value!);
    }
    if (pending.length >= MAX_PENDING) {
      pending.shift();
      dropped += 1;
    }
    pending.push({
      ts: at,
      category,
      level: resolved,
      code: name,
      ...(fields === undefined || Object.keys(fields).length === 0 ? {} : { fields }),
    });
    schedule(resolved === 'error' || category === 'invariant' ? URGENT_FLUSH_MS : FLUSH_MS);
  };

  const recorder: ClientLogRecorder = {
    session,
    record,
    invariant(eventCode, message, fields) {
      quiet += 1;
      try {
        console.warn(`botharness: ${message}`, fields);
      } finally {
        quiet -= 1;
      }
      record(
        'invariant',
        eventCode,
        { message: text(message), ...clientLogFields(fields) },
        'warn',
      );
    },
    async timeRpc(endpoint, run, failed) {
      const started = win?.performance?.now() ?? now();
      try {
        const result = await run();
        const ms = Math.round((win?.performance?.now() ?? now()) - started);
        const failure = failed?.(result);
        if (failure !== undefined)
          record('network', 'rpc-failed', { endpoint, code: failure, ms }, 'warn');
        else if (ms >= SLOW_RPC_MS) record('perf', 'rpc-slow', { endpoint, ms }, 'warn');
        return result;
      } catch (error) {
        const ms = Math.round((win?.performance?.now() ?? now()) - started);
        if ((error as { name?: unknown } | null)?.name !== 'AbortError')
          record('network', 'rpc-threw', { endpoint, ms, ...errorFields(error) }, 'warn');
        throw error;
      }
    },
    flush: () => flush(),
    dispose() {
      if (disposed) return;
      void flush(true);
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      for (const cleanup of cleanups.splice(0).reverse()) cleanup();
    },
  };

  if (win === undefined) return recorder;
  const listen = <K extends keyof WindowEventMap>(
    target: Window | Document,
    type: K | string,
    listener: (event: never) => void,
    capture = true,
  ): void => {
    target.addEventListener(type, listener as EventListener, { capture, passive: true });
    cleanups.push(() => target.removeEventListener(type, listener as EventListener, capture));
  };

  const nav = win.navigator;
  record('lifecycle', 'session-start', {
    surface: options.surface ?? 'browser',
    userAgent: text(nav?.userAgent ?? '', 200),
    language: nav?.language ?? '',
    viewport: `${win.innerWidth}x${win.innerHeight}`,
    dpr: win.devicePixelRatio,
    colorScheme: win.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    reducedMotion: win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    timezoneOffset: new Date().getTimezoneOffset(),
    cores: nav?.hardwareConcurrency ?? null,
    memoryGb: (nav as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
  });

  listen(win, 'error', (event: ErrorEvent) => {
    const target = event.target as Element | null;
    if (target !== null && target !== (win as unknown) && 'tagName' in target) {
      record('error', 'resource-load-failed', {
        tag: target.tagName.toLowerCase(),
        source: text(
          ((target as HTMLImageElement).currentSrc || (target as HTMLScriptElement).src || '')
            .replace(/^[a-z]+:\/\/[^/]+/iu, '')
            .replace(/[?#].*$/u, ''),
          160,
        ),
      });
      return;
    }
    record('error', 'uncaught-error', {
      ...errorFields(event.error ?? event.message),
      ...(event.filename
        ? {
            at: `${event.filename.replace(/^[a-z]+:\/\/[^/]+/iu, '')}:${event.lineno}:${event.colno}`,
          }
        : {}),
    });
  });
  listen(win, 'unhandledrejection', (event: PromiseRejectionEvent) =>
    record('error', 'unhandled-rejection', errorFields(event.reason)),
  );

  const originalError = win.console.error;
  const originalWarn = win.console.warn;
  const consoleError = function (this: Console, ...args: unknown[]): void {
    if (quiet === 0) {
      const { message, fields } = consoleText(args);
      record('error', 'console-error', { message, ...fields });
    }
    originalError.apply(this, args);
  };
  const consoleWarn = function (this: Console, ...args: unknown[]): void {
    if (quiet === 0) {
      const { message, fields } = consoleText(args);
      record('error', 'console-warn', { message, ...fields }, 'warn');
    }
    originalWarn.apply(this, args);
  };
  win.console.error = consoleError;
  win.console.warn = consoleWarn;
  cleanups.push(() => {
    if (win.console.error === consoleError) win.console.error = originalError;
    if (win.console.warn === consoleWarn) win.console.warn = originalWarn;
  });

  listen(win, 'click', (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof win.Element)) return;
    const control = describeControl(target);
    if (control !== undefined) record('action', 'click', control);
  });
  listen(win, 'contextmenu', (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof win.Element)) return;
    record('action', 'context-menu', describeControl(target) ?? { role: roleOf(target) });
  });
  listen(win, 'keydown', (event: KeyboardEvent) => {
    const keys = shortcutOf(event);
    if (keys === undefined) return;
    const target = event.target instanceof win.Element ? event.target : undefined;
    const editable =
      target !== undefined &&
      target.closest('input, textarea, [contenteditable="true"], [contenteditable=""]') !== null;
    record('action', 'key', { keys, ...(editable ? { inEditor: true } : {}) });
  });
  listen(win.document, 'visibilitychange', () =>
    record('lifecycle', win.document.visibilityState === 'hidden' ? 'page-hidden' : 'page-visible'),
  );
  listen(win, 'online', () => record('network', 'online'));
  listen(win, 'offline', () => record('network', 'offline', undefined, 'warn'));
  listen(win, 'pagehide', () => void flush(true));
  let lastSize = '';
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  listen(win, 'resize', () => {
    if (resizeTimer !== undefined) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const size = `${win.innerWidth}x${win.innerHeight}`;
      if (size !== lastSize) record('lifecycle', 'resize', { viewport: size });
      lastSize = size;
    }, 1000);
  });
  cleanups.push(() => {
    if (resizeTimer !== undefined) clearTimeout(resizeTimer);
  });

  const Observer = (win as unknown as { PerformanceObserver?: typeof PerformanceObserver })
    .PerformanceObserver;
  const supported = Observer?.supportedEntryTypes ?? [];
  if (Observer !== undefined) {
    const observe = (type: string, handle: (entry: PerformanceEntry) => void): void => {
      if (!supported.includes(type)) return;
      try {
        const observer = new Observer((list) => {
          for (const entry of list.getEntries()) handle(entry);
        });
        observer.observe({ type, buffered: true });
        cleanups.push(() => observer.disconnect());
      } catch {}
    };
    if (supported.includes('long-animation-frame'))
      observe('long-animation-frame', (entry) => {
        if (entry.duration < LONG_TASK_MS) return;
        const frame = entry as PerformanceEntry & {
          blockingDuration?: number;
          scripts?: Array<{ invoker?: string; sourceFunctionName?: string; duration?: number }>;
        };
        const top = [...(frame.scripts ?? [])].sort(
          (left, right) => (right.duration ?? 0) - (left.duration ?? 0),
        )[0];
        record(
          'perf',
          'long-frame',
          {
            ms: Math.round(entry.duration),
            blockingMs: Math.round(frame.blockingDuration ?? 0),
            ...(top === undefined
              ? {}
              : {
                  invoker: text(top.invoker ?? '', 120),
                  function: text(top.sourceFunctionName ?? '', 80),
                  scriptMs: Math.round(top.duration ?? 0),
                }),
          },
          entry.duration >= 1000 ? 'warn' : 'info',
        );
      });
    else
      observe('longtask', (entry) => {
        if (entry.duration >= LONG_TASK_MS)
          record(
            'perf',
            'long-task',
            { ms: Math.round(entry.duration) },
            entry.duration >= 1000 ? 'warn' : 'info',
          );
      });
    observe('navigation', (entry) => {
      const nav = entry as PerformanceNavigationTiming;
      if (nav.loadEventEnd > 0) loaded(nav);
    });
  }
  function loaded(nav: PerformanceNavigationTiming): void {
    record('perf', 'page-load', {
      type: nav.type,
      domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
      loadMs: Math.round(nav.loadEventEnd),
      transferKb: Math.round((nav.transferSize ?? 0) / 1024),
    });
  }
  const heartbeat = (): void => {
    const memory = (win.performance as Performance & { memory?: { usedJSHeapSize: number } })
      .memory;
    record('perf', 'heartbeat', {
      domNodes: win.document.getElementsByTagName('*').length,
      ...(memory === undefined ? {} : { heapMb: Math.round(memory.usedJSHeapSize / 1048576) }),
      visible: win.document.visibilityState === 'visible',
    });
  };
  const beat = setInterval(heartbeat, HEARTBEAT_MS);
  cleanups.push(() => clearInterval(beat));
  return recorder;
}

let active: ClientLogRecorder | undefined;

export function installClientLog(options: ClientLogRecorderOptions): ClientLogRecorder {
  active ??= createClientLogRecorder(options);
  return active;
}

export function clientLog(): ClientLogRecorder | undefined {
  return active;
}

export function disposeClientLog(): void {
  active?.dispose();
  active = undefined;
}

export function logClient(
  category: ClientLogCategory,
  eventCode: string,
  fields?: ClientLogFields,
  level?: ClientLogLevel,
): void {
  active?.record(category, eventCode, fields, level);
}

export function reportInvariant(eventCode: string, message: string, fields?: unknown): void {
  if (active !== undefined) active.invariant(eventCode, message, fields);
  else console.warn(`botharness: ${message}`, fields);
}
