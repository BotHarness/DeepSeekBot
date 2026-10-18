import { createServer } from 'node:http';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { argsOf } from './tob-uat-session.mjs';
import { connect } from './tob-mobile-driver.mjs';

export const callback = 'ai.botharness.deepseekbot.dev:/oauth2redirect';
export const fixtureConfig = {
  formatVersion: 1,
  protocolVersion: 1,
  name: 'LOCAL EMULATOR - not UAT',
  instanceId: 'tob-browser-fixture-uat',
  environment: 'uat',
  server: 'https://tob-browser-fixture.example.test',
  auth: {
    provider: 'workos',
    clientId: 'client_tobBrowserFixture',
    issuer: 'https://api.workos.com/user_management/client_tobBrowserFixture',
    authkitDomain: 'tob-browser-fixture-staging.authkit.app',
    deviceAuthorizationEndpoint: 'https://api.workos.com/user_management/authorize/device',
    tokenEndpoint: 'https://api.workos.com/user_management/authenticate',
    jwksUri: 'https://api.workos.com/sso/jwks/client_tobBrowserFixture',
    mobileRedirectUris: [callback],
  },
};
const userId = 'user_tob_browser_fixture';
export async function startFixture(createEmulator) {
  const emulator = await createEmulator({
    port: 0,
    hostname: '127.0.0.1',
    interactiveAuth: true,
    seed: { users: [{ id: userId, email: 'tob-browser@example.test', email_verified: true }] },
  });
  let scenario = 'success';
  let challenge;
  let metrics = {};
  const json = (res, value, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16384) throw Error('TOO_LARGE');
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString();
      if (url.pathname === '/__fixture/scenario' && req.method === 'POST') {
        if (!['success', 'wrong-state', 'wrong-verifier'].includes(body))
          throw Error('BAD_SCENARIO');
        scenario = body;
        metrics = {};
        challenge = undefined;
        return json(res, { scenario });
      }
      if (url.pathname === '/__fixture/status') return json(res, { scenario, ...metrics });
      if (url.pathname === '/.well-known/open-cloud-groups') return json(res, fixtureConfig);
      if (url.pathname === '/api/me') {
        const token = req.headers.authorization?.replace(/^Bearer /, '');
        if (!token) return json(res, {}, 401);
        const [h, p, sig] = token.split('.');
        const header = JSON.parse(Buffer.from(h, 'base64url'));
        const claims = JSON.parse(Buffer.from(p, 'base64url'));
        const jwks = await (
          await fetch(emulator.url + '/sso/jwks/' + fixtureConfig.auth.clientId)
        ).json();
        const key = jwks.keys.find((k) => k.kid === header.kid);
        if (
          header.alg !== 'RS256' ||
          !key ||
          claims.sub !== userId ||
          claims.exp <= Date.now() / 1000 ||
          !verify(
            'RSA-SHA256',
            Buffer.from(h + '.' + p),
            createPublicKey({ key, format: 'jwk' }),
            Buffer.from(sig, 'base64url'),
          )
        )
          return json(res, {}, 401);
        metrics.fixtureIdentityVerified = true;
        return json(res, { userId, instanceId: fixtureConfig.instanceId, instanceRole: 'admin' });
      }
      if (!['/user_management/authorize', '/user_management/authenticate'].includes(url.pathname))
        return json(res, {}, 404);
      if (url.pathname.endsWith('/authorize') && req.method === 'GET') {
        if (
          url.searchParams.get('redirect_uri') !== callback ||
          url.searchParams.get('client_id') !== fixtureConfig.auth.clientId ||
          url.searchParams.get('code_challenge_method') !== 'S256'
        )
          throw Error('WRONG_AUTH_REQUEST');
        challenge = url.searchParams.get('code_challenge');
        metrics.authorizeS256 = !!challenge;
        if (scenario === 'wrong-state') url.searchParams.set('state', 'deliberately-wrong-state');
        url.searchParams.set('login_hint', 'tob-browser@example.test');
        url.searchParams.set('redirect_uri', 'http://127.0.0.1/native-fixture-callback');
      }
      let forwardBody = body;
      if (url.pathname.endsWith('/authenticate')) {
        const fields = new URLSearchParams(body);
        metrics.tokenRequests = (metrics.tokenRequests ?? 0) + 1;
        metrics.publicClient = !fields.has('client_secret');
        metrics.verifierMatchesChallenge =
          createHash('sha256')
            .update(fields.get('code_verifier') ?? '')
            .digest('base64url') === challenge;
        if (scenario === 'wrong-verifier')
          fields.set('code_verifier', 'deliberately-wrong-verifier');
        forwardBody = fields.toString();
      }
      const options = {
        method: req.method,
        redirect: 'manual',
        headers: {
          'Content-Type': req.headers['content-type'] ?? 'application/x-www-form-urlencoded',
        },
        ...(req.method === 'POST' ? { body: forwardBody } : {}),
      };
      const upstream = await fetch(emulator.url + url.pathname + url.search, options);
      if (url.pathname.endsWith('/authenticate')) {
        metrics.exchangeStatus = upstream.status;
        if (upstream.ok) {
          const replay = await fetch(emulator.url + url.pathname, options);
          const replayBody = await replay.json();
          metrics.replayedCodeRejected =
            replay.status === 400 && replayBody.error === 'invalid_grant';
        }
      }
      let location = upstream.headers.get('location');
      if (location?.startsWith('http://127.0.0.1/native-fixture-callback?')) {
        location = callback + new URL(location).search;
        metrics.nativeCallbackRedirect = true;
      }
      res.writeHead(upstream.status, {
        'Content-Type': upstream.headers.get('content-type') ?? 'text/plain',
        'Cache-Control': 'no-store',
        ...(location ? { Location: location } : {}),
      });
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      json(res, { error: 'FIXTURE_FAILED' }, 500);
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: 'http://127.0.0.1:' + server.address().port,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await emulator.close();
    },
  };
}
export function installExpression(origin) {
  const parsed = new URL(origin);
  if (
    parsed.protocol !== 'http:' ||
    parsed.hostname !== '127.0.0.1' ||
    !parsed.port ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  )
    throw Error('LOOPBACK_FIXTURE_REQUIRED');
  return `(() => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) throw Error('DEBUG_ONLY');
    if (globalThis.__tobBrowserFixture) throw Error('FIXTURE_ALREADY_ACTIVE');
    const matches = [...globalThis.__r.getModules().values()].filter(m => m.isInitialized && m.publicModule?.exports?.cloudClient?.getSnapshot);
    if (matches.length !== 1) throw Error('CLOUD_MODULE_AMBIGUOUS');
    const client = matches[0].publicModule.exports.cloudClient;
    const before = client.getSnapshot();
    if (!before.ready || before.busy || before.rows.some(r => r.hasSession) || before.rows.some(r => r.config.environment !== 'uat')) throw Error('SIGNED_OUT_UAT_REQUIRED');
    const config = ${JSON.stringify(fixtureConfig)};
    const original = { rt: client.rt, vault: client.vault, identities: client.identities };
    let storage = JSON.stringify({ version: 1, entries: [{ config }] });
    const trace = { browserOpened: false, browserReturned: false };
    client.rt = { ...original.rt,
      read: async () => storage,
      write: async value => { storage = value; },
      request: async (url, init) => {
        const target = new URL(url);
        if (!((target.origin === config.server && ['/.well-known/open-cloud-groups', '/api/me'].includes(target.pathname)) || url === config.auth.tokenEndpoint)) throw Error('FIXTURE_EGRESS_REFUSED');
        return original.rt.request(${JSON.stringify(origin)} + target.pathname, init);
      },
      authorize: async (url, redirect) => {
        const target = new URL(url);
        if (target.origin !== 'https://api.workos.com' || target.pathname !== '/user_management/authorize' || redirect !== ${JSON.stringify(callback)}) throw Error('FIXTURE_EGRESS_REFUSED');
        trace.browserOpened = true;
        const returned = await original.rt.authorize(${JSON.stringify(origin)} + target.pathname + target.search, redirect);
        trace.browserReturned = returned !== null;
        return returned;
      },
    };
    client.vault = JSON.parse(storage); client.identities = new Map(); client.publish({ error: undefined });
    globalThis.__tobBrowserFixture = { client, original, trace };
    return { installed: true, localOnly: true, persistentStorageUntouched: true };
  })()`;
}
export function statusExpression(restore = false) {
  return `(() => {
    const f = globalThis.__tobBrowserFixture;
    if (!f || f.client.getSnapshot().busy) throw Error('FIXTURE_IDLE_REQUIRED');
    const snapshot = f.client.getSnapshot();
    const result = { ...f.trace, signedIn: snapshot.rows.some(r => r.identity?.instanceRole === 'admin'), error: snapshot.error ?? null };
    if (${restore}) {
      f.client.rt = f.original.rt; f.client.vault = f.original.vault; f.client.identities = f.original.identities;
      f.client.publish({ error: undefined }); delete globalThis.__tobBrowserFixture;
      result.restored = true;
    }
    return result;
  })()`;
}
async function main() {
  const mode = process.argv[2],
    args = argsOf(process.argv.slice(3));
  if (mode === 'serve') {
    const { createEmulator } = await import(pathToFileURL(args.emulator).href);
    const fixture = await startFixture(createEmulator);
    writeFileSync(args.info, JSON.stringify({ url: fixture.url, emulatorVersion: '0.15.0' }), {
      mode: 0o600,
    });
    console.log(JSON.stringify({ fixtureReady: true, localOnly: true }));
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.once(signal, async () => {
        await fixture.close();
        process.exit(0);
      });
    return;
  }
  const sims = JSON.parse(
    execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], { encoding: 'utf8' }),
  );
  const sim = Object.values(sims.devices)
    .flat()
    .find((d) => d.udid === args.simulator && d.state === 'Booted');
  if (!sim) throw Error('ASSIGNED_SIMULATOR_REQUIRED');
  const c = await connect(Number(args.metro), args.target, sim.name);
  try {
    if (!['install', 'status', 'restore'].includes(mode)) throw Error('INVALID_MODE');
    const result = await c.send('Runtime.evaluate', {
      expression:
        mode === 'install'
          ? installExpression(JSON.parse(readFileSync(args.info, 'utf8')).url)
          : statusExpression(mode === 'restore'),
      returnByValue: true,
    });
    console.log(JSON.stringify(result.result.value));
  } finally {
    c.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    console.error(JSON.stringify({ error: 'BROWSER_FIXTURE_FAILED' }));
    process.exitCode = 1;
  });
