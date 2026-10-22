import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';

const evaluationCodes = [
  'DEBUG_ONLY',
  'NOTIFICATION_OWNER_UNAVAILABLE',
  'NOTIFICATION_OWNER_NOT_READY',
  'NOTIFICATION_SAVE_FAILED',
  'NOTIFICATION_RESULT_UNAVAILABLE',
  'CLOUD_MODULE_AMBIGUOUS',
  'SESSION_BUSY',
  'INVALID_VAULT',
  'TRUSTED_IMPORT_REQUIRED',
  'EXISTING_SESSION_REFUSED',
  'LOCAL_SESSION_REMAINS',
  'VERIFIED_NATIVE_IDENTITY_REQUIRED',
  'INSPECTOR_TIMEOUT',
];

function envelope(value, state, fields = []) {
  return (
    value !== null &&
    typeof value === 'object' &&
    value.state === state &&
    Object.keys(value).length === fields.length + 1 &&
    fields.every((field) => Object.hasOwn(value, field))
  );
}

export function targetSocket(target, port, simulatorName) {
  if (
    !target ||
    target.deviceName !== simulatorName ||
    target.appId !== 'ai.botharness.deepseekbot.dev'
  )
    throw Error('EXPLICIT_SIMULATOR_APP_TARGET_REQUIRED');
  const url = new URL(target.webSocketDebuggerUrl);
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.port !== String(port) ||
    url.protocol !== 'ws:'
  )
    throw Error('LOOPBACK_DEBUGGER_REQUIRED');
  url.hostname = '127.0.0.1';
  return url;
}
export async function connect(port, targetId, simulatorName) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('INVALID_METRO_PORT');
  const targets = await (
    await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })
  ).json();
  const matches = targets.filter((t) => t.id === targetId);
  if (matches.length !== 1) throw Error('EXPLICIT_UNIQUE_TARGET_REQUIRED');
  const target = matches[0];
  const url = targetSocket(target, port, simulatorName);
  const ws = new WebSocket(url, { origin: `http://127.0.0.1:${port}` });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.terminate();
      reject(Error('INSPECTOR_TIMEOUT'));
    }, 5000);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once('error', () => {
      clearTimeout(timer);
      reject(Error('INSPECTOR_CONNECTION_FAILED'));
    });
  });
  let id = 0;
  const pending = new Map();
  const closed = new AbortController();
  ws.on('message', (raw) => {
    const r = JSON.parse(String(raw));
    const p = pending.get(r.id);
    if (!p) return;
    p.cleanup();
    if (r.error || r.result?.exceptionDetails) {
      const description = r.result?.exceptionDetails?.exception?.description ?? '';
      const code = evaluationCodes.find((v) => description.includes(v));
      p.reject(Error(code ?? 'INSPECTOR_EVALUATION_FAILED'));
    } else p.resolve(r.result);
  });
  ws.on('close', () => {
    closed.abort(Error('INSPECTOR_CLOSED'));
    for (const p of pending.values()) {
      p.cleanup();
      p.reject(Error('INSPECTOR_CLOSED'));
    }
    pending.clear();
  });
  const send = (method, params, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      if (ws.readyState !== WebSocket.OPEN) return reject(Error('INSPECTOR_CLOSED'));
      const n = ++id;
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        pending.delete(n);
      };
      const fail = (error) => {
        cleanup();
        reject(error);
      };
      const abort = () => fail(signal.reason);
      const timer = setTimeout(() => fail(Error('INSPECTOR_TIMEOUT')), 20000);
      pending.set(n, { resolve, reject, cleanup });
      signal?.addEventListener('abort', abort, { once: true });
      ws.send(JSON.stringify({ id: n, method, params }), (error) => {
        if (error) fail(Error('INSPECTOR_CONNECTION_FAILED'));
      });
    });
  return {
    send: (method, params) => send(method, params),
    async evaluateAsync(expression) {
      const key = JSON.stringify(`__botharnessInspector_${randomUUID().replaceAll('-', '')}`);
      const operation = new AbortController();
      const expiresAt = Date.now() + 20000;
      const abort = () => operation.abort(closed.signal.reason);
      closed.signal.addEventListener('abort', abort, { once: true });
      if (closed.signal.aborted) abort();
      const timer = setTimeout(() => operation.abort(Error('INSPECTOR_TIMEOUT')), 20000);
      const checkDeadline = () => {
        if (Date.now() >= expiresAt) operation.abort(Error('INSPECTOR_TIMEOUT'));
        operation.signal.throwIfAborted();
      };
      const evaluate = async (source) => {
        checkDeadline();
        const result = await send(
          'Runtime.evaluate',
          { expression: source, returnByValue: true },
          operation.signal,
        );
        checkDeadline();
        return result?.result?.value;
      };
      const cleanup = `globalThis[${key}]?.dispose()`;
      try {
        const started = await evaluate(`(() => {
          if (typeof __DEV__ === 'undefined' || !__DEV__) throw Error('DEBUG_ONLY');
          const key = ${key};
          const slot = { expiresAt: Date.now() + 20000, result: { state: 'pending' }, dispose: () => {
            clearTimeout(timer);
            if (globalThis[key] === slot) delete globalThis[key];
          } };
          const timer = setTimeout(slot.dispose, 20000);
          Object.defineProperty(globalThis, key, { value: slot, configurable: true });
          const settle = result => {
            if (Date.now() >= slot.expiresAt) slot.dispose();
            if (globalThis[key] === slot) slot.result = result;
          };
          try {
            (${expression}).then(
              value => settle({ state: 'fulfilled', value }),
              error => settle({ state: 'rejected', code: ${JSON.stringify(evaluationCodes)}.includes(error?.message) ? error.message : 'INSPECTOR_EVALUATION_FAILED' })
            );
          } catch { slot.dispose(); throw Error('INSPECTOR_EVALUATION_FAILED'); }
          return { state: 'started' };
        })()`);
        if (!envelope(started, 'started')) throw Error('INSPECTOR_RESULT_REQUIRED');
        while (true) {
          const result = await evaluate(`(() => {
            const slot = globalThis[${key}];
            if (!slot) throw Error('INSPECTOR_TIMEOUT');
            if (Date.now() >= slot.expiresAt) { slot.dispose(); throw Error('INSPECTOR_TIMEOUT'); }
            const result = slot.result;
            if (result.state !== 'pending') slot.dispose();
            return result;
          })()`);
          if (envelope(result, 'fulfilled', ['value'])) return result.value;
          if (envelope(result, 'rejected', ['code']))
            throw Error(
              evaluationCodes.includes(result.code) ? result.code : 'INSPECTOR_EVALUATION_FAILED',
            );
          if (!envelope(result, 'pending')) throw Error('INSPECTOR_RESULT_REQUIRED');
          await new Promise((resolve, reject) => {
            const signal = operation.signal;
            if (signal.aborted) return reject(signal.reason);
            const abort = () => {
              clearTimeout(pause);
              reject(signal.reason);
            };
            const pause = setTimeout(() => {
              signal.removeEventListener('abort', abort);
              resolve();
            }, 100);
            signal.addEventListener('abort', abort, { once: true });
          });
        }
      } finally {
        clearTimeout(timer);
        closed.signal.removeEventListener('abort', abort);
        if (ws.readyState === WebSocket.OPEN)
          ws.send(
            JSON.stringify({
              id: ++id,
              method: 'Runtime.evaluate',
              params: { expression: cleanup, returnByValue: true },
            }),
          );
      }
    },
    close: () => {
      closed.abort(Error('INSPECTOR_CLOSED'));
      ws.close();
    },
  };
}
