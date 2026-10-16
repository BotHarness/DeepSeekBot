export interface ClientDiagnosticEvent {
  seq: number;
  elapsedMs: number;
  source: 'lifecycle' | 'console-error' | 'console-warn' | 'error' | 'unhandledrejection';
  code: string;
}

export interface ClientDiagnosticSnapshot {
  version: 1;
  attempt: string;
  startedAt: number;
  state: 'starting' | 'shell-ready' | 'failed';
  events: ClientDiagnosticEvent[];
  dropped: number;
  firstFailure?: ClientDiagnosticEvent;
  shellMounted?: ClientDiagnosticEvent;
  delivery: 'pending' | 'delivered' | 'failed';
}
export function installClientObserver(win: Window & typeof globalThis): void {
  const target = win as Window &
    typeof globalThis & {
      __BOTHARNESS_CLIENT_DIAGNOSTICS__?: {
        snapshot(): ClientDiagnosticSnapshot;
        dispose(): void;
      };
    };
  if (target.__BOTHARNESS_CLIENT_DIAGNOSTICS__) return;
  const started = win.performance.now();
  const data: ClientDiagnosticSnapshot = {
    version: 1,
    attempt: win.crypto.randomUUID(),
    startedAt: Date.now(),
    state: 'starting',
    events: [],
    dropped: 0,
    delivery: 'pending',
  };
  let seq = 0;
  let disposed = false;
  let sending = false;
  let failures = 0;
  let timer = 0;
  let frame = 0;
  let mounted = false;
  let revision = 0;
  let delivered = -1;
  const originalError = win.console.error;
  const originalWarn = win.console.warn;
  const snapshot = (): ClientDiagnosticSnapshot => JSON.parse(JSON.stringify(data));
  const schedule = (delay = 250): void => {
    if (disposed || timer || sending || failures >= 4) return;
    timer = win.setTimeout(() => {
      timer = 0;
      void flush();
    }, delay);
  };
  const flush = async (): Promise<void> => {
    if (disposed || sending || failures >= 4) return;
    sending = true;
    const sentRevision = revision;
    try {
      const response = await win.fetch('./api/botharness/client-diagnostics', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot()),
        signal: win.AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('diagnostic-delivery-refused');
      failures = 0;
      delivered = sentRevision;
      data.delivery = 'delivered';
    } catch {
      failures += 1;
      data.delivery = failures >= 4 ? 'failed' : 'pending';
    } finally {
      sending = false;
      if (disposed) return;
      if (failures) schedule([0, 250, 1000, 3000][failures] ?? 3000);
      else if (revision !== delivered) schedule();
    }
  };
  const record = (code: string, source: ClientDiagnosticEvent['source'], failure = false): void => {
    if (disposed) return;
    const event = {
      seq: ++seq,
      elapsedMs: Math.max(0, Math.round(win.performance.now() - started)),
      source,
      code,
    };
    if (failure) {
      data.state = 'failed';
      data.firstFailure ??= event;
    }
    if (code === 'shell-mounted' && source === 'lifecycle') data.shellMounted ??= event;
    data.events.push(event);
    if (data.events.length > 64) {
      data.events.splice(16, 1);
      data.dropped += 1;
    }
    revision += 1;
    schedule();
  };
  const classify = (values: unknown[]): string => {
    let text = '';
    for (const value of values.slice(0, 4)) {
      try {
        if (typeof value === 'string') text += value.slice(0, 2048);
        else if (value instanceof win.Error) text += value.message.slice(0, 2048);
      } catch {}
    }
    if (text.includes("renderSlot('root') before any 'root' registration"))
      return 'root-registration-missing';
    if (text.includes('uiConversation.binding: unknown session'))
      return 'conversation-session-missing';
    if (text.includes('dynamicCordisRunner') || text.includes('syncInspectManifest'))
      return 'client-runner-failed';
    if (text.includes('[connection] connection lost')) return 'connection-lost';
    return 'unclassified-exception';
  };
  const errorConsole = function (...args: unknown[]): void {
    record(classify(args), 'console-error', true);
    originalError.apply(win.console, args);
  };
  const warnConsole = function (...args: unknown[]): void {
    const code = classify(args);
    if (code !== 'unclassified-exception') record(code, 'console-warn', code !== 'connection-lost');
    originalWarn.apply(win.console, args);
  };
  win.console.error = errorConsole;
  win.console.warn = warnConsole;
  const onError = (event: ErrorEvent): void => {
    record(
      event instanceof win.ErrorEvent
        ? classify([event.error, event.message])
        : 'resource-load-failed',
      'error',
      true,
    );
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    record(classify([event.reason]), 'unhandledrejection', true);
  };
  win.addEventListener('error', onError, true);
  win.addEventListener('unhandledrejection', onRejection);
  const shellPresent = (): boolean => {
    if (win.document.querySelector('[data-dsh-boot]')) return false;
    const surfaces = [
      win.document.querySelector('.bh-panel-glyph')?.closest('button'),
      win.document.querySelector('.bh-root.bh-main'),
    ];
    return surfaces.some((surface) => {
      const rect = surface?.getBoundingClientRect();
      return !!rect && rect.width > 0 && rect.height > 0;
    });
  };
  const inspect = (): void => {
    if (disposed) return;
    const present = shellPresent();
    if (!present && mounted) {
      mounted = false;
      record('shell-lost', 'lifecycle', true);
    }
    if (!present || mounted || frame) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      if (!shellPresent()) return;
      mounted = true;
      if (!data.firstFailure) data.state = 'shell-ready';
      record('shell-mounted', 'lifecycle');
    });
  };
  const observer = new win.MutationObserver(inspect);
  observer.observe(win.document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden'],
  });
  let deadline = 0;
  const onVisibility = (): void => {
    win.clearTimeout(deadline);
    if (win.document.visibilityState !== 'visible') {
      record('observation-deferred', 'lifecycle');
      return;
    }
    inspect();
    deadline = win.setTimeout(() => {
      if (win.document.visibilityState !== 'visible') record('observation-deferred', 'lifecycle');
      else if (!mounted) record('shell-timeout', 'lifecycle', true);
    }, 30000);
  };
  win.document.addEventListener('visibilitychange', onVisibility);
  const heartbeat = win.setInterval(() => {
    inspect();
    revision += 1;
    schedule();
  }, 10000);
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    win.document.removeEventListener('visibilitychange', onVisibility);
    win.clearTimeout(timer);
    win.clearTimeout(deadline);
    win.clearInterval(heartbeat);
    win.cancelAnimationFrame(frame);
    win.removeEventListener('error', onError, true);
    win.removeEventListener('unhandledrejection', onRejection);
    win.removeEventListener('pagehide', onHide);
    if (win.console.error === errorConsole) win.console.error = originalError;
    if (win.console.warn === warnConsole) win.console.warn = originalWarn;
    delete target.__BOTHARNESS_CLIENT_DIAGNOSTICS__;
  };
  const onHide = (): void => {
    record('page-hidden', 'lifecycle');
    try {
      void win
        .fetch('./api/botharness/client-diagnostics', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snapshot()),
          keepalive: true,
        })
        .catch(() => {});
    } catch {}
    dispose();
  };
  win.addEventListener('pagehide', onHide);
  target.__BOTHARNESS_CLIENT_DIAGNOSTICS__ = { snapshot, dispose };
  record('observer-installed', 'lifecycle');
  onVisibility();
}

export function clientObserverScript(): string {
  return `(${installClientObserver.toString()})(window);`;
}
