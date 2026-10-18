import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { argsOf, privateFile } from './tob-uat-session.mjs';

export function fixtureExpression(mode, state) {
  if (!['inject', 'checkpoint', 'signed-out'].includes(mode) || state.config.environment !== 'uat')
    throw Error('UAT_FIXTURE_REQUIRED');
  if (!['admin', 'user'].includes(state.instanceRole ?? 'admin'))
    throw Error('INVALID_INSTANCE_ROLE');
  return `(async () => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) throw Error('DEBUG_ONLY');
    const modules = [...globalThis.__r.getModules().values()];
    const matches = modules.filter(m => m.isInitialized && m.publicModule?.exports?.cloudClient?.getSnapshot);
    if (matches.length !== 1) throw Error('CLOUD_MODULE_AMBIGUOUS');
    const client = matches[0].publicModule.exports.cloudClient;
    await client.load();
    if (client.getSnapshot().busy) throw Error('SESSION_BUSY');
    const expected = ${JSON.stringify({ config: state.config, userId: state.userId, instanceRole: state.instanceRole ?? 'admin', ...(mode === 'inject' ? { accessToken: state.accessToken, refreshToken: state.refreshToken } : {}) })};
    const vault = JSON.parse(await client.rt.read());
    if (vault.version !== 1 || !Array.isArray(vault.entries)) throw Error('INVALID_VAULT');
    const stable = v => v && typeof v === 'object' ? Array.isArray(v) ? v.map(stable) : Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
    const entries = vault.entries.filter(e => e.config.instanceId === expected.config.instanceId);
    if (entries.length !== 1 || JSON.stringify(stable(entries[0].config)) !== JSON.stringify(stable(expected.config))) throw Error('TRUSTED_IMPORT_REQUIRED');
    const entry = entries[0];
    if (${JSON.stringify(mode)} === 'inject') {
      if (entry.session) {
        if (entry.session.accessToken === expected.accessToken && entry.session.refreshToken === expected.refreshToken && entry.session.userId === expected.userId) return { injected: true, alreadyPrepared: true, restartRequired: true };
        throw Error('EXISTING_SESSION_REFUSED');
      }
      entry.session = { accessToken: expected.accessToken, refreshToken: expected.refreshToken, userId: expected.userId };
      await client.rt.write(JSON.stringify(vault));
      return { injected: true, restartRequired: true };
    }
    if (${JSON.stringify(mode)} === 'signed-out') {
      if (entry.session || client.getSnapshot().rows.some(r => r.config.instanceId === expected.config.instanceId && r.hasSession)) throw Error('LOCAL_SESSION_REMAINS');
      return { signedOut: true, configRetained: true };
    }
    const row = client.getSnapshot().rows.find(r => r.config.instanceId === expected.config.instanceId);
    if (!entry.session || row?.identity?.userId !== expected.userId || row.identity.instanceRole !== expected.instanceRole) throw Error('VERIFIED_NATIVE_IDENTITY_REQUIRED');
    return { accessToken: entry.session.accessToken, refreshToken: entry.session.refreshToken };
  })()`;
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
  const target = targets.find((t) => t.id === targetId);
  const url = targetSocket(target, port, simulatorName);
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const store = join(root, 'node_modules/.pnpm');
  const dependency = readdirSync(store)
    .filter((name) => name.startsWith('ws@8.'))
    .sort()
    .pop();
  if (!dependency) throw Error('DEBUG_WEBSOCKET_DEPENDENCY_MISSING');
  const WebSocket = createRequire(join(store, dependency, 'node_modules/ws/package.json'))('ws');
  const ws = new WebSocket(url, { origin: `http://127.0.0.1:${port}` });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
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
export async function main(mode, args) {
  const state = JSON.parse(privateFile(args.session));
  const sims = JSON.parse(
    execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], { encoding: 'utf8' }),
  );
  const simulator = Object.values(sims.devices)
    .flat()
    .find((d) => d.udid === args.simulator && d.state === 'Booted');
  if (!simulator) throw Error('ASSIGNED_SIMULATOR_REQUIRED');
  const c = await connect(Number(args.metro), args.target, simulator.name);
  try {
    const key = '__tobNativeFixture_' + randomUUID().replaceAll('-', '');
    let result;
    try {
      await c.send('Runtime.evaluate', {
        expression: `globalThis[${JSON.stringify(key)}] = { done: false }; void (${fixtureExpression(mode, state)}).then(value => { if (globalThis[${JSON.stringify(key)}]) globalThis[${JSON.stringify(key)}] = { done: true, value }; }, error => { if (globalThis[${JSON.stringify(key)}]) globalThis[${JSON.stringify(key)}] = { done: true, error: /^[A-Z_]+$/.test(error.message) ? error.message : 'NATIVE_CHECK_FAILED' }; })`,
        returnByValue: true,
      });
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        const poll = await c.send('Runtime.evaluate', {
          expression: `globalThis[${JSON.stringify(key)}]`,
          returnByValue: true,
        });
        const envelope = poll.result.value;
        if (envelope?.done) {
          if (envelope.error) throw Error(envelope.error);
          result = envelope.value;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (!result) throw Error('NATIVE_RESULT_TIMEOUT');
    } finally {
      await c.send('Runtime.evaluate', {
        expression: `delete globalThis[${JSON.stringify(key)}]`,
        returnByValue: true,
      });
    }
    if (mode === 'checkpoint') {
      if (!result?.accessToken || !result.refreshToken) throw Error('NATIVE_SESSION_REQUIRED');
      const sid = JSON.parse(Buffer.from(result.accessToken.split('.')[1], 'base64url')).sid;
      if (sid !== state.sid) throw Error('SESSION_IDENTITY_CHANGED');
      const hash = createHash('sha256').update(result.refreshToken).digest('hex');
      const previous = createHash('sha256').update(state.refreshToken).digest('hex');
      writeFileSync(args.session, JSON.stringify({ ...state, ...result, checkpoint: true }), {
        mode: 0o600,
      });
      console.log(
        JSON.stringify({
          event: 'native_checkpoint',
          verifiedIdentity: true,
          instanceRole: state.instanceRole ?? 'admin',
          verifiedAdmin: (state.instanceRole ?? 'admin') === 'admin',
          sameSession: true,
          refreshChangedSinceCheckpoint: hash !== previous,
        }),
      );
    } else {
      if (mode === 'inject' ? result?.injected !== true : result?.signedOut !== true)
        throw Error('NATIVE_RESULT_REQUIRED');
      console.log(JSON.stringify({ event: 'native_fixture', ...result }));
    }
  } finally {
    c.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2], argsOf(process.argv.slice(3))).catch((error) => {
    console.error(
      JSON.stringify({
        event: 'native_fixture_failed',
        code: /^[A-Z_]+$/.test(error.message) ? error.message : 'CHECK_FAILED',
      }),
    );
    process.exitCode = 1;
  });
}
