import WebSocket from 'ws';

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
  ws.on('message', (raw) => {
    const r = JSON.parse(String(raw));
    const p = pending.get(r.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(r.id);
    if (r.error || r.result?.exceptionDetails) {
      const description = r.result?.exceptionDetails?.exception?.description ?? '';
      const code = [
        'DEBUG_ONLY',
        'NOTIFICATION_OWNER_UNAVAILABLE',
        'NOTIFICATION_OWNER_NOT_READY',
        'NOTIFICATION_SAVE_FAILED',
        'CLOUD_MODULE_AMBIGUOUS',
        'SESSION_BUSY',
        'INVALID_VAULT',
        'TRUSTED_IMPORT_REQUIRED',
        'EXISTING_SESSION_REFUSED',
        'LOCAL_SESSION_REMAINS',
        'VERIFIED_NATIVE_IDENTITY_REQUIRED',
      ].find((v) => description.includes(v));
      p.reject(Error(code ?? 'INSPECTOR_EVALUATION_FAILED'));
    } else p.resolve(r.result);
  });
  ws.on('close', () => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error('INSPECTOR_CLOSED'));
    }
    pending.clear();
  });
  return {
    send: (method, params) =>
      new Promise((resolve, reject) => {
        const n = ++id;
        const timer = setTimeout(() => {
          pending.delete(n);
          reject(Error('INSPECTOR_TIMEOUT'));
        }, 20000);
        pending.set(n, { resolve, reject, timer });
        ws.send(JSON.stringify({ id: n, method, params }));
      }),
    close: () => ws.close(),
  };
}
