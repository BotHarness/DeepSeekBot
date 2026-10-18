import { mkdirSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseInstance, connectionKey } from '../src/cloud/instance-contract.ts';

export function privateFile(file) {
  if (!isAbsolute(file)) throw Error('ABSOLUTE_PRIVATE_PATH_REQUIRED');
  for (let p = file; ; p = dirname(p)) {
    const s = lstatSync(p);
    if (s.isSymbolicLink()) throw Error('SYMLINK_REFUSED');
    if (p === file && (!s.isFile() || s.uid !== process.getuid() || s.mode & 0o077))
      throw Error('PRIVATE_FILE_REQUIRED');
    if (p === dirname(file) && (!s.isDirectory() || s.uid !== process.getuid() || s.mode & 0o077))
      throw Error('PRIVATE_DIRECTORY_REQUIRED');
    if (dirname(p) === p) break;
  }
  return readFileSync(file, 'utf8');
}
export function argsOf(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i].startsWith('--') || !args[i + 1] || Object.hasOwn(out, args[i].slice(2)))
      throw Error('INVALID_ARGUMENTS');
    out[args[i].slice(2)] = args[i + 1];
  }
  return out;
}
export async function request(url, body, key) {
  const r = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  const value = r.status === 204 || r.status === 205 ? {} : await r.json();
  return { ok: r.ok, status: r.status, value };
}
const requireThat = (ok, code) => {
  if (!ok) throw Error(code);
};
export async function operator(profile) {
  const read = (name) => privateFile(join(profile, name));
  const target = JSON.parse(read('uat-target.json'));
  const bootstrap = JSON.parse(read('bootstrap-target.json'));
  const config = parseInstance(JSON.parse(read('tob-instance.json')));
  const line = read('secrets.env')
    .split('\n')
    .filter((v) => v.startsWith('WORKOS_API_KEY='));
  requireThat(line.length === 1, 'API_KEY_REQUIRED');
  const key = line[0].slice('WORKOS_API_KEY='.length);
  requireThat(
    config.environment === 'uat' &&
      target.PUBLIC_BASE_URL === config.server &&
      target.INSTANCE_ID === config.instanceId &&
      target.WORKOS_CLIENT_ID === config.auth.clientId &&
      bootstrap.clientId === config.auth.clientId &&
      bootstrap.environmentId === target.WORKOS_ENVIRONMENT_ID,
    'UAT_TARGET_REQUIRED',
  );
  const health = await request(config.server + '/healthz');
  requireThat(
    health.ok &&
      health.value.environment === 'uat' &&
      health.value.instanceId === config.instanceId,
    'UAT_HEALTH_MISMATCH',
  );
  const discovery = await request(config.server + '/.well-known/open-cloud-groups');
  requireThat(
    discovery.ok && connectionKey(parseInstance(discovery.value)) === connectionKey(config),
    'DISCOVERY_CHANGED',
  );
  return { key, config, bootstrap, target };
}
async function activeSessions(user, key) {
  const r = await request(
    `https://api.workos.com/user_management/users/${user}/sessions?limit=100`,
    undefined,
    key,
  );
  requireThat(
    r.ok && Array.isArray(r.value.data) && !r.value.list_metadata?.after,
    'SESSION_LIST_INCOMPLETE',
  );
  return r.value.data.filter((s) => s.status === 'active').map((s) => s.id);
}
export async function main(command, args) {
  const { key, config, bootstrap } = await operator(args.profile);
  const file = join(args.run, 'session.json');
  if (command === 'prepare') {
    requireThat(isAbsolute(args.run), 'ABSOLUTE_RUN_DIRECTORY_REQUIRED');
    mkdirSync(args.run, { mode: 0o700 });
    const invitation = await request(
      `https://api.workos.com/user_management/invitations/${bootstrap.invitationId}`,
      undefined,
      key,
    );
    const userId = invitation.value.accepted_user_id;
    requireThat(
      invitation.ok && invitation.value.state === 'accepted' && /^user_[A-Za-z0-9]+$/.test(userId),
      'ACCEPTED_BOOTSTRAP_REQUIRED',
    );
    const user = await request(
      `https://api.workos.com/user_management/users/${userId}`,
      undefined,
      key,
    );
    requireThat(
      user.ok &&
        user.value.id === userId &&
        user.value.email.toLowerCase() === bootstrap.expectedEmail.toLowerCase() &&
        user.value.email_verified === true,
      'VERIFIED_BOOTSTRAP_REQUIRED',
    );
    const before = await activeSessions(userId, key);
    const magic = await request(
      'https://api.workos.com/user_management/magic_auth',
      { email: user.value.email },
      key,
    );
    requireThat(
      magic.ok && magic.value.user_id === userId && typeof magic.value.code === 'string',
      'MAGIC_AUTH_UNAVAILABLE',
    );
    const login = await request(config.auth.tokenEndpoint, {
      client_id: config.auth.clientId,
      client_secret: key,
      grant_type: 'urn:workos:oauth:grant-type:magic-auth:code',
      email: user.value.email,
      code: magic.value.code,
    });
    requireThat(
      login.ok &&
        typeof login.value.access_token === 'string' &&
        typeof login.value.refresh_token === 'string',
      'AUTHENTICATION_FAILED',
    );
    const sid = JSON.parse(Buffer.from(login.value.access_token.split('.')[1], 'base64url')).sid;
    requireThat(/^session_[A-Za-z0-9]+$/.test(sid), 'INVALID_SESSION');
    const state = {
      version: 1,
      config,
      userId,
      sid,
      before,
      accessToken: login.value.access_token,
      refreshToken: login.value.refresh_token,
    };
    writeFileSync(file, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
    try {
      const me = await request(config.server + '/api/me', undefined, state.accessToken);
      requireThat(
        me.ok && me.value.userId === userId && me.value.instanceRole === 'admin',
        'UAT_ADMISSION_FAILED',
      );
      requireThat(
        !before.includes(sid) && (await activeSessions(userId, key)).includes(sid),
        'SESSION_IDENTITY_MISMATCH',
      );
    } catch (error) {
      await request(
        'https://api.workos.com/user_management/sessions/revoke',
        { session_id: sid },
        key,
      );
      throw error;
    }
    console.log(
      JSON.stringify({
        event: 'uat_fixture_prepared',
        apiLogin: true,
        serviceVerifiedAdmin: true,
        baselineSessions: before.length,
      }),
    );
    return;
  }
  const state = JSON.parse(privateFile(file));
  requireThat(connectionKey(config) === connectionKey(state.config), 'FIXTURE_TARGET_CHANGED');
  if (command === 'verify-logout') {
    const after = await activeSessions(state.userId, key);
    requireThat(!after.includes(state.sid), 'SESSION_STILL_ACTIVE');
    requireThat(
      state.before.every((s) => after.includes(s)),
      'OTHER_SESSION_LOST',
    );
    requireThat(state.checkpoint, 'NATIVE_CHECKPOINT_REQUIRED');
    const retry = await request(config.auth.tokenEndpoint, {
      client_id: config.auth.clientId,
      grant_type: 'refresh_token',
      refresh_token: state.refreshToken,
    });
    requireThat(!retry.ok && retry.value.error === 'invalid_grant', 'REVOKED_REFRESH_ACCEPTED');
    console.log(
      JSON.stringify({
        event: 'uat_logout_verified',
        ownSessionRevoked: true,
        latestRefreshRejected: true,
        otherSessionsPreserved: true,
      }),
    );
  } else if (command === 'cleanup') {
    const r = await request(
      'https://api.workos.com/user_management/sessions/revoke',
      { session_id: state.sid },
      key,
    );
    requireThat(
      r.ok || !(await activeSessions(state.userId, key)).includes(state.sid),
      'CLEANUP_FAILED',
    );
    console.log(JSON.stringify({ event: 'uat_fixture_revoked' }));
  } else throw Error('UNKNOWN_COMMAND');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2], argsOf(process.argv.slice(3))).catch((error) => {
    console.error(
      JSON.stringify({
        event: 'uat_fixture_failed',
        code: /^[A-Z_]+$/.test(error.message) ? error.message : 'CHECK_FAILED',
      }),
    );
    process.exitCode = 1;
  });
}
