import { setTimeout as delay } from 'node:timers/promises';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';

export const IM_OPTIONS = {
  'credentials-stdin': { type: 'boolean' },
  'verification-stdin': { type: 'boolean' },
  wait: { type: 'boolean' },
} as const;

export const IM_COMMANDS = [
  { command: 'im-apps', description: 'list live Provider IM application authorization flows' },
  {
    command: 'im-authorize',
    description: 'start IM application authorization for feishu or weixin',
  },
  { command: 'im-credentials', description: 'submit IM application credentials from JSON stdin' },
  { command: 'im-verify', description: 'submit an IM application verification code from stdin' },
  { command: 'im-cancel', description: 'cancel a pending IM application authorization attempt' },
  {
    command: 'pairing-status',
    description: 'poll a Provider IM application authorization attempt',
  },
] as const;

export interface ImValues {
  'credentials-stdin'?: boolean;
  'verification-stdin'?: boolean;
  wait?: boolean;
}

interface ImOperation {
  command: string;
  target: string;
  wait: boolean;
  credentials?: { appId: string; appSecret: string; domain: 'lark' | 'feishu' };
  verifyCode?: string;
}

type Rpc = <T>(method: string, args: Record<string, unknown>) => Promise<T>;
type Platform = 'feishu' | 'weixin';
const states = [
  'credentials',
  'creating',
  'pending',
  'scanned',
  'needs_verification',
  'connecting',
  'ready',
  'cancelled',
  'expired',
  'failed',
] as const;
type State = (typeof states)[number];
interface Authorization {
  version: 1;
  attemptId: string;
  platform: Platform;
  state: State;
  expiresAt: number;
  accountRef?: string;
  fingerprint?: string;
  connected?: boolean;
  qrDataUrl?: string;
  next: string[];
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
function usage(message: string): never {
  throw new CliLiveError('usage', message);
}
function invalidResponse(): never {
  throw new CliLiveError('host-protocol-error', 'Invalid IM应用授权 response.');
}

export async function prepareImAuthorization(
  command: string,
  rest: string[],
  values: ImValues,
  io: BotCreateCliIo,
): Promise<ImOperation> {
  const count = command === 'im-apps' ? 0 : 1;
  if (rest.length !== count) {
    if (rest.length > count && ['im-authorize', 'im-credentials', 'im-verify'].includes(command))
      throw new CliLiveError('secret-in-argv', 'IM应用授权 inputs must arrive through stdin.');
    usage(`${command} requires ${count} positional arguments.`);
  }
  const target = rest[0]?.trim() ?? '';
  if (command === 'im-authorize') {
    if (!['feishu', 'weixin'].includes(target)) usage('Choose feishu or weixin.');
  } else if (count === 1 && !/^[A-Za-z0-9_-]{1,128}$/u.test(target)) {
    usage('Use the attemptId returned by im-authorize.');
  }
  if (values['credentials-stdin'] && command !== 'im-credentials')
    usage('--credentials-stdin is only valid for im-credentials.');
  if (values['verification-stdin'] && command !== 'im-verify')
    usage('--verification-stdin is only valid for im-verify.');
  if (values.wait && command !== 'pairing-status')
    usage('--wait is only valid for pairing-status.');
  const operation: ImOperation = { command, target, wait: values.wait === true };
  if (command === 'im-credentials') {
    if (!values['credentials-stdin']) usage('im-credentials requires --credentials-stdin.');
    const input = await (io.readStdin?.() ?? Promise.resolve(''));
    let credentials: Record<string, unknown>;
    try {
      if (input.length > 16384) usage('IM credential JSON is too large.');
      credentials = record(JSON.parse(input));
    } catch {
      usage('IM credentials require JSON from stdin.');
    }
    const { appId, appSecret, domain } = credentials;
    if (
      Object.keys(credentials).some((key) => !['appId', 'appSecret', 'domain'].includes(key)) ||
      typeof appId !== 'string' ||
      !/^cli_[A-Za-z0-9_-]+$/u.test(appId) ||
      typeof appSecret !== 'string' ||
      !appSecret.trim() ||
      appSecret.length > 4096 ||
      (domain !== 'lark' && domain !== 'feishu')
    )
      usage('Credential JSON requires appId, appSecret and domain (lark or feishu).');
    operation.credentials = { appId, appSecret, domain };
  }
  if (command === 'im-verify') {
    if (!values['verification-stdin']) usage('im-verify requires --verification-stdin.');
    const verifyCode = (await (io.readStdin?.() ?? Promise.resolve(''))).trim();
    if (!/^\d{4,8}$/u.test(verifyCode)) usage('Verification stdin must contain 4–8 digits.');
    operation.verifyCode = verifyCode;
  }
  return operation;
}

function project(raw: unknown, expectedId?: string, expectedPlatform?: Platform): Authorization {
  const value = record(raw);
  if (
    value['version'] !== 1 ||
    typeof value['attemptId'] !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/u.test(value['attemptId']) ||
    (expectedId !== undefined && value['attemptId'] !== expectedId) ||
    !['feishu', 'weixin'].includes(String(value['channel'])) ||
    (expectedPlatform !== undefined && value['channel'] !== expectedPlatform) ||
    !states.includes(value['state'] as State) ||
    typeof value['expiresAt'] !== 'number' ||
    !Number.isFinite(value['expiresAt'])
  )
    invalidResponse();
  const authorization: Authorization = {
    version: 1,
    attemptId: value['attemptId'],
    platform: value['channel'] as Platform,
    state: value['state'] as State,
    expiresAt: value['expiresAt'],
    next: [],
  };
  if (authorization.state === 'ready') {
    const description = record(value['description']);
    const account = record(description['account']);
    if (
      typeof value['accountRef'] !== 'string' ||
      !value['accountRef'] ||
      description['version'] !== 1 ||
      description['botId'] !== value['accountRef'] ||
      description['channel'] !== authorization.platform ||
      typeof account['fingerprint'] !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(account['fingerprint']) ||
      typeof description['connected'] !== 'boolean'
    )
      invalidResponse();
    authorization.accountRef = value['accountRef'];
    authorization.fingerprint = account['fingerprint'];
    authorization.connected = description['connected'];
  }
  if (
    authorization.platform === 'weixin' &&
    ['pending', 'scanned', 'needs_verification', 'connecting'].includes(authorization.state) &&
    value['qrDataUrl'] !== undefined
  ) {
    if (
      typeof value['qrDataUrl'] !== 'string' ||
      value['qrDataUrl'].length > 200000 ||
      !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/u.test(value['qrDataUrl'])
    )
      invalidResponse();
    authorization.qrDataUrl = value['qrDataUrl'];
  }
  if (authorization.state === 'credentials')
    authorization.next.push(
      `Submit credential JSON with im-credentials ${authorization.attemptId} --credentials-stdin.`,
    );
  else if (authorization.state === 'needs_verification')
    authorization.next.push(
      `Submit the phone verification code with im-verify ${authorization.attemptId} --verification-stdin.`,
    );
  else if (['creating', 'pending', 'scanned', 'connecting'].includes(authorization.state)) {
    if (authorization.qrDataUrl)
      authorization.next.push('Open qrDataUrl and scan/confirm it in WeChat.');
    authorization.next.push(`Poll pairing-status ${authorization.attemptId} --wait.`);
  }
  return authorization;
}

export async function runImAuthorization(
  operation: ImOperation,
  rpc: Rpc,
  signal: AbortSignal,
): Promise<unknown> {
  if (operation.command === 'im-apps' || operation.command === 'im-authorize') {
    const apps = record(await rpc('messagingApps', {}));
    if (!Array.isArray(apps['setups'])) invalidResponse();
    const providers = apps['setups'].flatMap((raw: unknown) => {
      const setup = record(raw);
      const platform = setup['platform'];
      return setup['version'] === 1 &&
        (platform === 'feishu' || platform === 'weixin') &&
        setup['providerId'] === `dsh-im/${platform}` &&
        setup['endpoint'] === 'dsh-im/app-setup' &&
        setup['kind'] === (platform === 'feishu' ? 'credentials' : 'qr')
        ? [{ platform, providerId: setup['providerId'], kind: setup['kind'] }]
        : [];
    });
    if (operation.command === 'im-apps') return { providers };
    if (!providers.some((provider) => provider.platform === operation.target))
      throw new CliLiveError(
        'capability-unavailable',
        'The Host has no compatible IM应用授权 Provider.',
      );
  }
  const method = {
    'im-authorize': 'setup.start',
    'im-credentials': 'setup.credentials',
    'im-verify': 'setup.verify',
    'im-cancel': 'setup.cancel',
    'pairing-status': 'setup.poll',
  }[operation.command];
  if (!method) usage('Unknown IM应用授权 command.');
  const start = operation.command === 'im-authorize';
  const payload = start
    ? { channel: operation.target }
    : {
        attemptId: operation.target,
        ...operation.credentials,
        ...(operation.verifyCode === undefined ? {} : { verifyCode: operation.verifyCode }),
      };
  const knownId = start ? undefined : operation.target;
  let platform: Platform | undefined = start
    ? (operation.target as Platform)
    : operation.command === 'im-credentials'
      ? 'feishu'
      : operation.command === 'im-verify'
        ? 'weixin'
        : undefined;
  const call = async (name: string, input: Record<string, unknown>): Promise<Authorization> => {
    try {
      const authorization = project(
        await rpc('dsh-im/app-setup', { method: name, payload: input }),
        knownId,
        platform,
      );
      const secrets = [operation.credentials?.appSecret, operation.verifyCode].filter(
        (value): value is string => value !== undefined,
      );
      const exposed = [
        authorization.attemptId,
        authorization.accountRef,
        authorization.fingerprint,
        authorization.qrDataUrl,
      ];
      if (
        exposed.some((value) =>
          secrets.some(
            (secret) => value?.includes(secret) || value?.includes(encodeURIComponent(secret)),
          ),
        )
      )
        invalidResponse();
      return authorization;
    } catch (error) {
      const allowed = [
        'usage',
        'host-unreachable',
        'host-unauthorized',
        'host-untrusted',
        'host-protocol-error',
        'bad-request',
        'capability-unavailable',
        'setup-expired',
        'setup-limit',
        'setup-account-exists',
        'gateway/bad-request',
        'gateway/unknown-endpoint',
      ];
      const code =
        error instanceof CliLiveError && allowed.includes(error.code) ? error.code : 'setup-failed';
      throw new CliLiveError(
        code,
        'IM应用授权 request failed; inspect the attempt before retrying.',
        undefined,
        knownId ? { attemptId: knownId } : undefined,
      );
    }
  };
  let authorization = await call(method, payload);
  platform ??= authorization.platform;
  while (true) {
    if (
      operation.command !== 'im-cancel' &&
      ['failed', 'expired', 'cancelled'].includes(authorization.state)
    )
      throw new CliLiveError(
        `authorization-${authorization.state}`,
        'IM应用授权 did not complete.',
        undefined,
        { attemptId: authorization.attemptId },
      );
    if (
      !operation.wait ||
      !['creating', 'pending', 'scanned', 'connecting'].includes(authorization.state)
    )
      return { authorization };
    try {
      await delay(1000, undefined, { signal });
    } catch {
      throw new CliLiveError(
        'authorization-timeout',
        'Poll the same attempt before starting another.',
        undefined,
        { attemptId: authorization.attemptId },
      );
    }
    authorization = await call('setup.poll', { attemptId: authorization.attemptId });
  }
}
