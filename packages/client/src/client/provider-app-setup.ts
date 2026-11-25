import type { MessagingSetup } from '../../../core/src/messaging/provider.js';
import type { MessagingIdentityInput } from '../../../core/src/messaging/identity.js';
import type { BridgeRpc } from './bridge.js';

export type AppSetupDescriptor = MessagingSetup & { providerId: string };
export interface AppSetupAttempt {
  version: 1;
  attemptId: string;
  platform: MessagingSetup['platform'];
  state:
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
  expiresAt: number;
  accountRef?: string;
  fingerprint?: string;
  name?: string;
  connected?: boolean;
  qrDataUrl?: string;
}
interface SetupSession {
  descriptor: AppSetupDescriptor;
  attempt: AppSetupAttempt;
}
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const failure = () => new Error('app-setup-unavailable');

export class ProviderAppSetup {
  #sessions = new Map<string, SetupSession>();
  #pending = new Map<string, Promise<AppSetupAttempt>>();
  constructor(private readonly rpc: BridgeRpc) {}
  current(scope: string): AppSetupAttempt | undefined {
    const attempt = this.#sessions.get(scope)?.attempt;
    return attempt ? structuredClone(attempt) : undefined;
  }
  descriptor(scope: string): AppSetupDescriptor | undefined {
    const value = this.#sessions.get(scope)?.descriptor;
    return value ? { ...value } : undefined;
  }
  binding(scope: string): MessagingIdentityInput {
    const session = this.#sessions.get(scope);
    if (
      !session ||
      session.attempt.state !== 'ready' ||
      !session.attempt.accountRef ||
      !session.attempt.fingerprint
    )
      throw failure();
    return {
      kind: 'bind',
      providerId: session.descriptor.providerId,
      accountRef: session.attempt.accountRef,
      fingerprint: session.attempt.fingerprint,
    };
  }
  async start(scope: string, descriptor: AppSetupDescriptor): Promise<AppSetupAttempt> {
    if (this.#pending.has(scope)) return this.#pending.get(scope)!;
    if (this.#sessions.has(scope)) return this.poll(scope);
    if (
      descriptor.version !== 1 ||
      descriptor.endpoint !== 'dsh-im/app-setup' ||
      descriptor.providerId !== `dsh-im/${descriptor.platform}` ||
      !['feishu', 'weixin'].includes(descriptor.platform)
    )
      throw failure();
    const promise = this.#call(descriptor, 'setup.start', { channel: descriptor.platform })
      .then((attempt) => {
        this.#sessions.set(scope, { descriptor: { ...descriptor }, attempt });
        return attempt;
      })
      .finally(() => this.#pending.delete(scope));
    this.#pending.set(scope, promise);
    return promise;
  }
  async poll(scope: string): Promise<AppSetupAttempt> {
    const pending = this.#pending.get(scope);
    if (pending) return pending;
    return this.#operate(scope, 'setup.poll', {});
  }
  credentials(
    scope: string,
    input: { appId: string; appSecret: string; domain: 'lark' | 'feishu' },
  ): Promise<AppSetupAttempt> {
    return this.#operate(scope, 'setup.credentials', input);
  }
  verify(scope: string, verifyCode: string): Promise<AppSetupAttempt> {
    if (!/^\d{4,8}$/.test(verifyCode) || this.#sessions.get(scope)?.descriptor.kind !== 'qr')
      return Promise.reject(failure());
    return this.#operate(scope, 'setup.verify', { verifyCode });
  }
  async cancel(scope: string): Promise<AppSetupAttempt> {
    if (!this.#sessions.has(scope)) await this.#pending.get(scope);
    const session = this.#sessions.get(scope);
    if (!session) throw failure();
    const attempt = await this.#call(session.descriptor, 'setup.cancel', {
      attemptId: session.attempt.attemptId,
    });
    await this.#pending.get(scope)?.catch(() => undefined);
    session.attempt = attempt;
    return this.current(scope)!;
  }
  forget(scope: string): void {
    if (this.#pending.has(scope)) throw failure();
    this.#sessions.delete(scope);
  }
  #operate(
    scope: string,
    method: string,
    payload: Record<string, unknown>,
  ): Promise<AppSetupAttempt> {
    const session = this.#sessions.get(scope);
    if (!session || this.#pending.has(scope)) return Promise.reject(failure());
    const promise = this.#call(session.descriptor, method, {
      ...payload,
      attemptId: session.attempt.attemptId,
    })
      .then((attempt) => {
        session.attempt = attempt;
        return this.current(scope)!;
      })
      .catch((error: unknown) => {
        if (error instanceof Error && 'code' in error && error.code === 'setup-expired') {
          if (session.attempt.state === 'ready' && method === 'setup.poll')
            return this.current(scope)!;
          this.#sessions.delete(scope);
        }
        throw error;
      })
      .finally(() => this.#pending.delete(scope));
    this.#pending.set(scope, promise);
    return promise;
  }
  async #call(
    descriptor: AppSetupDescriptor,
    method: string,
    payload: Record<string, unknown>,
  ): Promise<AppSetupAttempt> {
    const result = await this.rpc.call('/api', descriptor.endpoint, { method, payload });
    if (!result.ok)
      throw Object.assign(failure(), {
        code: result.error.code === 'setup-expired' ? 'setup-expired' : 'setup-failed',
      });
    const raw = record(result.value);
    if (
      !raw ||
      raw['version'] !== 1 ||
      raw['channel'] !== descriptor.platform ||
      typeof raw['attemptId'] !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(raw['attemptId']) ||
      typeof raw['expiresAt'] !== 'number' ||
      ![
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
      ].includes(String(raw['state']))
    )
      throw failure();
    const attempt: AppSetupAttempt = {
      version: 1,
      attemptId: raw['attemptId'],
      platform: descriptor.platform,
      state: raw['state'] as AppSetupAttempt['state'],
      expiresAt: raw['expiresAt'],
    };
    if (attempt.state === 'ready') {
      const description = record(raw['description']);
      const account = record(description?.['account']);
      if (
        typeof raw['accountRef'] !== 'string' ||
        description?.['version'] !== 1 ||
        description['botId'] !== raw['accountRef'] ||
        description['channel'] !== descriptor.platform ||
        typeof account?.['fingerprint'] !== 'string' ||
        !/^[a-f0-9]{64}$/.test(account['fingerprint']) ||
        typeof description['connected'] !== 'boolean'
      )
        throw failure();
      attempt.accountRef = raw['accountRef'];
      attempt.fingerprint = account['fingerprint'];
      attempt.name = typeof account['name'] === 'string' ? account['name'] : raw['accountRef'];
      attempt.connected = description['connected'];
    }
    if (
      descriptor.kind === 'qr' &&
      ['pending', 'scanned', 'needs_verification', 'connecting'].includes(attempt.state) &&
      typeof raw['qrDataUrl'] === 'string' &&
      /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(raw['qrDataUrl']) &&
      raw['qrDataUrl'].length <= 200000
    )
      attempt.qrDataUrl = raw['qrDataUrl'];
    return attempt;
  }
}
