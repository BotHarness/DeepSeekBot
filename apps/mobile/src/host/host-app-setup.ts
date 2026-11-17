import { MethodRefused } from '@botharness/host-client/client';
import type { HostClient } from './host-settings';

export type AppPlatform = 'feishu' | 'weixin';
export type AppSetupKind = 'credentials' | 'qr';

export type AppSetupDescriptor = {
  version: 1;
  platform: AppPlatform;
  providerId: string;
  endpoint: 'dsh-im/app-setup';
  kind: AppSetupKind;
};

export type AppSetupState =
  | 'credentials'
  | 'creating'
  | 'pending'
  | 'scanned'
  | 'needs_verification'
  | 'connecting'
  | 'ready'
  | 'cancelled'
  | 'expired'
  | 'failed';

export type AppSetupAttempt = {
  version: 1;
  attemptId: string;
  platform: AppPlatform;
  state: AppSetupState;
  expiresAt: number;
  accountRef?: string;
  fingerprint?: string;
  name?: string;
  connected?: boolean;
  qrDataUrl?: string;
};

type SetupFailure = { kind: 'rejected'; message: string } | { kind: 'refused' } | { kind: 'error' };

export type AppSetupResult = { kind: 'ok'; attempt: AppSetupAttempt } | SetupFailure;

export type AppSetupsResult = { kind: 'ok'; setups: AppSetupDescriptor[] } | SetupFailure;

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const STATES: string[] = [
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
];

export function projectAttempt(value: unknown): AppSetupAttempt | undefined {
  const raw = record(value);
  if (
    !raw ||
    raw['version'] !== 1 ||
    (raw['channel'] !== 'feishu' && raw['channel'] !== 'weixin') ||
    typeof raw['attemptId'] !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(raw['attemptId']) ||
    typeof raw['expiresAt'] !== 'number' ||
    !STATES.includes(String(raw['state']))
  )
    return undefined;
  const attempt: AppSetupAttempt = {
    version: 1,
    attemptId: raw['attemptId'],
    platform: raw['channel'],
    state: raw['state'] as AppSetupState,
    expiresAt: raw['expiresAt'],
  };
  if (attempt.state === 'ready') {
    const description = record(raw['description']);
    const account = record(description?.['account']);
    if (
      typeof raw['accountRef'] !== 'string' ||
      description?.['version'] !== 1 ||
      description['botId'] !== raw['accountRef'] ||
      description['channel'] !== attempt.platform ||
      typeof account?.['fingerprint'] !== 'string' ||
      !/^[a-f0-9]{64}$/.test(account['fingerprint']) ||
      typeof description['connected'] !== 'boolean'
    )
      return undefined;
    attempt.accountRef = raw['accountRef'];
    attempt.fingerprint = account['fingerprint'];
    attempt.name = typeof account['name'] === 'string' ? account['name'] : raw['accountRef'];
    attempt.connected = description['connected'];
  }
  if (
    attempt.platform === 'weixin' &&
    ['pending', 'scanned', 'needs_verification', 'connecting'].includes(attempt.state) &&
    typeof raw['qrDataUrl'] === 'string' &&
    /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(raw['qrDataUrl']) &&
    raw['qrDataUrl'].length <= 200_000
  )
    attempt.qrDataUrl = raw['qrDataUrl'];
  return attempt;
}

export async function listAppSetups(client: HostClient): Promise<AppSetupsResult> {
  try {
    const value = record(await client.call<unknown>('messagingApps', {}));
    const setups = Array.isArray(value?.['setups']) ? value!['setups'] : [];
    return {
      kind: 'ok',
      setups: setups.flatMap((raw: unknown) => {
        const setup = record(raw);
        if (
          setup?.['version'] !== 1 ||
          (setup['platform'] !== 'feishu' && setup['platform'] !== 'weixin') ||
          setup['providerId'] !== `dsh-im/${setup['platform']}` ||
          setup['endpoint'] !== 'dsh-im/app-setup' ||
          (setup['kind'] !== 'credentials' && setup['kind'] !== 'qr')
        )
          return [];
        return [
          {
            version: 1 as const,
            platform: setup['platform'],
            providerId: String(setup['providerId']),
            endpoint: 'dsh-im/app-setup' as const,
            kind: setup['kind'],
          },
        ];
      }),
    };
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown): SetupFailure {
  if (error instanceof MethodRefused) {
    if (error.code === 'secret-route-refused') return { kind: 'refused' };
    return { kind: 'rejected', message: error.message };
  }
  return { kind: 'error' };
}

async function operate(
  client: HostClient,
  method: string,
  payload: Record<string, unknown>,
): Promise<AppSetupResult> {
  try {
    const value = await client.call<unknown>('dsh-im/app-setup', { method, payload });
    const attempt = projectAttempt(value);
    return attempt === undefined ? { kind: 'error' } : { kind: 'ok', attempt };
  } catch (error) {
    return failure(error);
  }
}

export function startAppSetup(client: HostClient, platform: AppPlatform): Promise<AppSetupResult> {
  return operate(client, 'setup.start', { channel: platform });
}

export function pollAppSetup(client: HostClient, attemptId: string): Promise<AppSetupResult> {
  return operate(client, 'setup.poll', { attemptId });
}

export function cancelAppSetup(client: HostClient, attemptId: string): Promise<AppSetupResult> {
  return operate(client, 'setup.cancel', { attemptId });
}

export function submitAppCredentials(
  client: HostClient,
  attemptId: string,
  appId: string,
  appSecret: string,
  domain: 'lark' | 'feishu',
): Promise<AppSetupResult> {
  return operate(client, 'setup.credentials', { attemptId, appId, appSecret, domain });
}

export function verifyAppSetup(
  client: HostClient,
  attemptId: string,
  verifyCode: string,
): Promise<AppSetupResult> {
  if (!/^\d{4,8}$/.test(verifyCode)) return Promise.resolve({ kind: 'error' });
  return operate(client, 'setup.verify', { attemptId, verifyCode });
}
