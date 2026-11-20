import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parse } from 'yaml';

export function qqIdentity(appId) {
  if (typeof appId !== 'string' || !/^\d+$/u.test(appId))
    throw new Error('Register the verified numeric AppID before connecting');
  const digest = createHash('sha256').update(appId).digest('hex').slice(0, 24);
  return { botId: `qq_${digest}`, secretRef: `DSH_QQBOT_APP_SECRET_${digest.toUpperCase()}` };
}

export function readQqCredential(home, appId, confirmedIdle) {
  if (confirmedIdle !== true)
    throw new Error('Verify the selected source receiver is stopped before credential reuse');
  const directory = resolve(home);
  if (existsSync(join(directory, 'botharness.writer.json')))
    throw new Error('Source Profile has a writer record; inspect its exact Host');
  const identity = qqIdentity(appId);
  const credentialFile = join(directory, '.credentials.yaml');
  if (process.platform !== 'win32' && (statSync(credentialFile).mode & 0o077) !== 0)
    throw new Error('Source native credential file must be private');
  let configuration;
  let credentials;
  try {
    configuration = JSON.parse(
      readFileSync(join(directory, 'integrations/dsh-qq/config.json'), 'utf8'),
    );
    credentials = parse(readFileSync(credentialFile, 'utf8'));
  } catch {
    throw new Error('Cannot read the selected native QQ authorization');
  }
  const matches = configuration?.bots?.filter((bot) => bot.appId === appId);
  if (
    matches?.length !== 1 ||
    matches[0].botId !== identity.botId ||
    matches[0].secretRef !== identity.secretRef
  )
    throw new Error('Source native QQ identity does not match the selected App');
  const secret = credentials?.refs?.[identity.secretRef];
  if (typeof secret !== 'string' || !secret.trim() || /[\u0000-\u001f\u007f]/u.test(secret))
    throw new Error('Selected QQ credential is unavailable in native Credentials');
  return secret.trim();
}

export function qqConnectionRequest(client, { port, tokenFile, connect = false, appSecret }) {
  qqIdentity(client.appId);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Provide an explicit --port');
  if (typeof tokenFile !== 'string' || !tokenFile)
    throw new Error('Provide the claimed Host --token-file');
  if (client.location === 'local') {
    const child = relative(resolve(client.home), resolve(tokenFile));
    if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child))
      throw new Error('Token file must belong to the claimed DSH home');
  } else if (
    !client.home.startsWith('/') ||
    !tokenFile.startsWith(`${client.home.replace(/\/$/u, '')}/`) ||
    tokenFile.split('/').some((part) => part === '..' || part === '.')
  )
    throw new Error('Remote token file must belong to the claimed DSH home');
  return {
    appId: client.appId,
    botId: qqIdentity(client.appId).botId,
    host: `http://127.0.0.1:${port}`,
    tokenFile,
    connect,
    ...(connect ? { appSecret } : {}),
  };
}

export async function nativeQqOperation(input, fetcher = fetch, readToken) {
  const refuse = (code) => {
    throw new Error(code);
  };
  const base = new URL(input.host);
  if (
    base.protocol !== 'http:' ||
    base.hostname !== '127.0.0.1' ||
    base.pathname !== '/' ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    refuse('qq-invalid-loopback');
  const token = readToken
    ? await readToken(input.tokenFile)
    : (await import('node:fs/promises'))
        .readFile(input.tokenFile, 'utf8')
        .then((value) => value.trim());
  const secret = await token;
  if (typeof secret !== 'string' || !secret.trim()) refuse('qq-owner-token-unavailable');
  const login = new URL(base);
  login.searchParams.set('token', secret.trim());
  let cookie = '';
  const request = async (url, options = {}) => {
    try {
      return await fetcher(url, {
        ...options,
        redirect: 'manual',
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      return refuse('qq-host-unreachable');
    }
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await request(login, { headers: cookie ? { cookie } : {} });
    cookie = response.headers
      .getSetCookie()
      .map((entry) => entry.split(';')[0])
      .join('; ');
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403) refuse('qq-owner-login-refused');
    if (cookie) break;
  }
  if (!cookie) refuse('qq-owner-login-refused');
  const rpc = async (method, payload) => {
    const rpcId = (await import('node:crypto')).randomUUID();
    const response = await request(new URL('/api/dsh-im/qq', base), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'client-request',
        rpcId,
        method: 'dsh-im/qq',
        payload: { method, payload },
      }),
    });
    let envelope;
    try {
      envelope = await response.json();
    } catch {
      refuse('qq-provider-protocol-refused');
    }
    if (
      !response.ok ||
      envelope?.type !== 'server-response' ||
      envelope.rpcId !== rpcId ||
      envelope.result?.ok !== true
    )
      refuse('qq-provider-request-refused');
    if (!Array.isArray(envelope.result.value?.bots)) refuse('qq-provider-protocol-refused');
    return envelope.result.value;
  };
  let status = await rpc('connection.status', {});
  if (status.bots.some((bot) => bot.botId !== input.botId)) refuse('qq-target-has-another-app');
  if (input.connect && status.bots.length === 0) {
    if (typeof input.appSecret !== 'string' || !input.appSecret.trim())
      refuse('qq-selected-credential-unavailable');
    status = await rpc('bot.bind-credentials', { appId: input.appId, appSecret: input.appSecret });
  }
  const bot = status.bots.find((value) => value.botId === input.botId);
  return {
    configured: Boolean(bot),
    connected: bot?.connected === true,
    state: ['connected', 'connecting', 'error', 'offline'].includes(bot?.state)
      ? bot.state
      : 'unconfigured',
    botId: input.botId,
  };
}

export function strictQqSshArguments(configuration, remoteNode) {
  const { host, user, identityFile, knownHostsFile } = configuration;
  if (
    typeof host !== 'string' ||
    !/^[A-Za-z0-9.:-]+$/u.test(host) ||
    host.startsWith('-') ||
    typeof user !== 'string' ||
    !/^[A-Za-z_][A-Za-z0-9_-]*$/u.test(user) ||
    typeof remoteNode !== 'string' ||
    !/^\/[A-Za-z0-9_./-]+$/u.test(remoteNode) ||
    remoteNode.split('/').includes('..')
  )
    throw new Error('Invalid explicit SSH target or remote Node path');
  if (!identityFile || !knownHostsFile || !existsSync(identityFile) || !existsSync(knownHostsFile))
    throw new Error('SSH requires an existing dedicated identity and verified known_hosts file');
  const program = `let input='';for await(const chunk of process.stdin)input+=chunk;try{const result=await (${nativeQqOperation.toString()})(JSON.parse(input));process.stdout.write(JSON.stringify(result));}catch{process.stderr.write('qq-native-operation-refused');process.exitCode=1;}`;
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  return [
    '-F',
    'none',
    '-i',
    resolve(identityFile),
    '-o',
    'IdentitiesOnly=yes',
    '-o',
    `UserKnownHostsFile=${resolve(knownHostsFile)}`,
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=10',
    `${user}@${host}`,
    `${quote(remoteNode)} --input-type=module -e ${quote(program)}`,
  ];
}

export async function runQqNative(request, { sshConfig, remoteNode } = {}) {
  if (!sshConfig) return nativeQqOperation(request);
  let configuration;
  try {
    configuration = JSON.parse(readFileSync(sshConfig, 'utf8'));
  } catch {
    throw new Error('Cannot read explicit private SSH configuration');
  }
  const result = spawnSync('ssh', strictQqSshArguments(configuration, remoteNode), {
    input: JSON.stringify(request),
    encoding: 'utf8',
    timeout: 150000,
    maxBuffer: 65536,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error('QQ SSH operation failed; inspect the exact receiver before retrying');
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error('QQ SSH operation returned no verified result');
  }
}
