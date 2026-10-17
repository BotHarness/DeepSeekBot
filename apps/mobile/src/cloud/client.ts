import {
  ClientError,
  connectionKey,
  MOBILE_REDIRECT_URI,
  parseInstance,
  type InstanceConfig,
} from './instance-contract';

export type Identity = { userId: string; instanceId: string; instanceRole: 'admin' };
type Session = { accessToken: string; refreshToken: string; userId?: string | undefined };
type Entry = { config: InstanceConfig; session?: Session };
type Vault = { version: 1; entries: Entry[] };
export type CloudRow = {
  config: InstanceConfig;
  hasSession: boolean;
  identity?: Identity | undefined;
};
export type CloudSnapshot = {
  ready: boolean;
  busy: boolean;
  rows: CloudRow[];
  error?: string | undefined;
};
export interface CloudRuntime {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  request(url: string, init?: RequestInit): Promise<Response>;
  random(): string;
  challenge(verifier: string): Promise<string>;
  authorize(url: string, callback: string): Promise<string | null>;
  now(): number;
}
const fail = (code: string): never => {
  throw new ClientError(code);
};
export const cloudError = (e: unknown) => (e instanceof ClientError ? e.code : 'CLOUD_UNAVAILABLE');
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('INVALID_RESPONSE');
  return value as Record<string, unknown>;
}
function tokenPair(value: unknown): Session {
  const v = record(value);
  if (
    typeof v.access_token !== 'string' ||
    !v.access_token ||
    v.access_token.length > 16384 ||
    typeof v.refresh_token !== 'string' ||
    !v.refresh_token ||
    v.refresh_token.length > 16384
  )
    return fail('INVALID_RESPONSE');
  return { accessToken: v.access_token, refreshToken: v.refresh_token };
}
export function parseCloudQr(text: string): InstanceConfig {
  if (text.length > 4096) return fail('INVALID_INSTANCE_CONFIG');
  try {
    return parseInstance(JSON.parse(text));
  } catch {
    return fail('INVALID_INSTANCE_CONFIG');
  }
}
export function configurationChanges(previous: InstanceConfig, next: InstanceConfig) {
  const fields = (c: InstanceConfig): Record<string, string> => ({
    server: c.server,
    instanceId: c.instanceId,
    environment: c.environment,
    clientId: c.auth.clientId,
    issuer: c.auth.issuer,
    authkitDomain: c.auth.authkitDomain,
    deviceAuthorizationEndpoint: c.auth.deviceAuthorizationEndpoint,
    tokenEndpoint: c.auth.tokenEndpoint,
    jwksUri: c.auth.jwksUri,
    mobileRedirectUris: c.auth.mobileRedirectUris.join(', '),
  });
  const before = fields(previous),
    after = fields(next);
  return Object.keys(before)
    .filter((field) => before[field] !== after[field])
    .map((field) => ({ field, previous: before[field], next: after[field] }));
}
export function callbackCode(url: string, state: string): string {
  let callback: URL;
  try {
    callback = new URL(url);
  } catch {
    return fail('INVALID_CALLBACK');
  }
  if (
    url.split('?')[0] !== MOBILE_REDIRECT_URI ||
    callback.hash ||
    callback.searchParams.getAll('state').length !== 1 ||
    callback.searchParams.get('state') !== state
  )
    return fail('INVALID_CALLBACK');
  if (callback.searchParams.has('error')) return fail('LOGIN_DENIED');
  const code = callback.searchParams.get('code');
  if (callback.searchParams.getAll('code').length !== 1 || !code || code.length > 4096)
    return fail('INVALID_CALLBACK');
  return code;
}
function nearExpiry(token: string, now: number): boolean {
  try {
    const part = token.split('.')[1];
    if (!part) return true;
    const v = record(JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))));
    return typeof v.exp !== 'number' || v.exp * 1000 <= now + 30000;
  } catch {
    return true;
  }
}

export class CloudClient {
  private vault: Vault = { version: 1, entries: [] };
  private identities = new Map<string, Identity>();
  private listeners = new Set<() => void>();
  private snapshot: CloudSnapshot = { ready: false, busy: false, rows: [] };
  private loadPromise?: Promise<void>;
  constructor(private readonly rt: CloudRuntime) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<CloudSnapshot> = {}) {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      rows: this.vault.entries.map((e) => ({
        config: e.config,
        hasSession: !!e.session,
        identity: this.identities.get(e.config.instanceId),
      })),
    };
    for (const listener of this.listeners) listener();
  }
  load = (): Promise<void> =>
    (this.loadPromise ??= (async () => {
      try {
        const raw = await this.rt.read();
        if (raw) {
          const v = record(JSON.parse(raw));
          if (v.version !== 1 || !Array.isArray(v.entries) || v.entries.length > 20)
            fail('INVALID_LOCAL_STATE');
          const entries = (v.entries as unknown[]).map((value) => {
            const e = record(value),
              config = parseInstance(e.config);
            if (e.session === undefined) return { config };
            const saved = record(e.session);
            const session = tokenPair({
              access_token: saved.accessToken,
              refresh_token: saved.refreshToken,
            });
            if (
              saved.userId !== undefined &&
              (typeof saved.userId !== 'string' || !saved.userId.startsWith('user_'))
            )
              fail('INVALID_LOCAL_STATE');
            return { config, session: { ...session, userId: saved.userId as string | undefined } };
          });
          if (
            new Set(entries.map((e) => e.config.instanceId)).size !== entries.length ||
            new Set(entries.map((e) => e.config.server)).size !== entries.length
          )
            fail('INVALID_LOCAL_STATE');
          this.vault = { version: 1, entries };
        }
        this.publish({ ready: true });
      } catch {
        this.publish({ error: 'STORAGE_UNAVAILABLE' });
        fail('STORAGE_UNAVAILABLE');
      }
    })());
  private async lock<T>(run: () => Promise<T>): Promise<T> {
    await this.load();
    if (this.snapshot.busy) return fail('SESSION_BUSY');
    this.publish({ busy: true, error: undefined });
    try {
      return await run();
    } catch (e) {
      this.publish({ error: cloudError(e) });
      throw e;
    } finally {
      this.publish({ busy: false });
    }
  }
  private entry(id: string) {
    return (
      this.vault.entries.find((e) => e.config.instanceId === id) ?? fail('INSTANCE_NOT_IMPORTED')
    );
  }
  private async save(entry: Entry) {
    const entries = this.vault.entries.filter(
      (e) => e.config.instanceId !== entry.config.instanceId,
    );
    const next: Vault = { version: 1, entries: [...entries, entry] };
    try {
      await this.rt.write(JSON.stringify(next));
    } catch {
      return fail('STORAGE_UNAVAILABLE');
    }
    this.vault = next;
    this.publish();
  }
  private async json(url: string, init: RequestInit = {}) {
    let response: Response;
    try {
      response = await this.rt.request(url, { ...init, redirect: 'error', credentials: 'omit' });
    } catch {
      return fail('NETWORK_UNAVAILABLE');
    }
    if (response.redirected || (response.status >= 300 && response.status < 400))
      return fail('REDIRECT_REFUSED');
    if (Number(response.headers.get('content-length')) > 65536) return fail('INVALID_RESPONSE');
    const reader = response.body?.getReader();
    if (!reader) return fail('INVALID_RESPONSE');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 65536) {
          await reader.cancel();
          return fail('INVALID_RESPONSE');
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const text = new TextDecoder().decode(bytes);
    try {
      return { status: response.status, ok: response.ok, value: record(JSON.parse(text)) };
    } catch {
      return fail('INVALID_RESPONSE');
    }
  }
  private async discovery(config: InstanceConfig) {
    const r = await this.json(config.server + '/.well-known/open-cloud-groups');
    if (!r.ok) return fail('INSTANCE_UNAVAILABLE');
    if (connectionKey(parseInstance(r.value)) !== connectionKey(config))
      return fail('INSTANCE_CONFIG_CHANGED');
  }
  importConfig = (text: string, replace = false) =>
    this.lock(async () => {
      const config = parseCloudQr(text);
      if (
        config.environment !== 'uat' ||
        !config.auth.mobileRedirectUris.includes(MOBILE_REDIRECT_URI)
      )
        fail('MOBILE_NOT_ENABLED');
      const old = this.vault.entries.find((e) => e.config.instanceId === config.instanceId);
      const changed = !!old && connectionKey(old.config) !== connectionKey(config);
      if (changed && !replace) return fail('CONFIG_REPLACEMENT_REQUIRED');
      if (
        this.vault.entries.some(
          (e) => e.config.instanceId !== config.instanceId && e.config.server === config.server,
        )
      )
        fail('SERVER_ALREADY_IMPORTED');
      if (!old && this.vault.entries.length >= 20) fail('INSTANCE_LIMIT');
      await this.discovery(config);
      if (changed) this.identities.delete(config.instanceId);
      await this.save({ config, ...(!changed && old?.session ? { session: old.session } : {}) });
      return config;
    });
  private async acceptTokens(entry: Entry, value: unknown) {
    const session = { ...tokenPair(value), userId: entry.session?.userId };
    await this.save({ config: entry.config, session });
    return this.entry(entry.config.instanceId);
  }
  private async rotate(entry: Entry) {
    if (!entry.session) return fail('NOT_LOGGED_IN');
    await this.discovery(entry.config);
    const r = await this.json(entry.config.auth.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: entry.config.auth.clientId,
        grant_type: 'refresh_token',
        refresh_token: entry.session.refreshToken,
      }).toString(),
    });
    if (!r.ok) {
      if (r.status === 400 && r.value.error === 'invalid_grant') {
        this.identities.delete(entry.config.instanceId);
        await this.save({ config: entry.config });
        return fail('LOGIN_REQUIRED');
      }
      return fail('AUTH_RETRY_REQUIRED');
    }
    return this.acceptTokens(entry, r.value);
  }
  private async current(entry: Entry) {
    if (!entry.session) return fail('NOT_LOGGED_IN');
    return nearExpiry(entry.session.accessToken, this.rt.now()) ? this.rotate(entry) : entry;
  }
  private async me(entry: Entry): Promise<Identity> {
    this.identities.delete(entry.config.instanceId);
    this.publish();
    if (!entry.session) return fail('NOT_LOGGED_IN');
    await this.discovery(entry.config);
    const r = await this.json(entry.config.server + '/api/me', {
      headers: { Authorization: 'Bearer ' + entry.session.accessToken },
    });
    if (!r.ok) {
      this.identities.delete(entry.config.instanceId);
      this.publish();
      return fail(
        r.status === 403
          ? 'INSTANCE_ACCESS_DENIED'
          : r.status === 401
            ? 'LOGIN_REQUIRED'
            : 'INSTANCE_UNAVAILABLE',
      );
    }
    if (
      typeof r.value.userId !== 'string' ||
      !r.value.userId.startsWith('user_') ||
      r.value.instanceId !== entry.config.instanceId ||
      r.value.instanceRole !== 'admin' ||
      (entry.session.userId && entry.session.userId !== r.value.userId)
    )
      fail('IDENTITY_RESPONSE_MISMATCH');
    const identity: Identity = {
      userId: r.value.userId as string,
      instanceId: entry.config.instanceId,
      instanceRole: 'admin',
    };
    await this.save({
      config: entry.config,
      session: { ...entry.session, userId: identity.userId },
    });
    this.identities.set(entry.config.instanceId, identity);
    this.publish();
    return identity;
  }
  login = (id: string) =>
    this.lock(async () => {
      let entry = this.entry(id);
      if (entry.session) return fail('ALREADY_LOGGED_IN');
      await this.discovery(entry.config);
      const verifier = this.rt.random(),
        state = this.rt.random(),
        challenge = await this.rt.challenge(verifier);
      const deadline = this.rt.now() + 10 * 60 * 1000;
      const url = new URL('https://api.workos.com/user_management/authorize');
      url.search = new URLSearchParams({
        client_id: entry.config.auth.clientId,
        provider: 'authkit',
        response_type: 'code',
        redirect_uri: MOBILE_REDIRECT_URI,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }).toString();
      const callback = await this.rt.authorize(url.href, MOBILE_REDIRECT_URI);
      if (!callback) return fail('LOGIN_CANCELLED');
      if (this.rt.now() >= deadline) return fail('LOGIN_EXPIRED');
      const code = callbackCode(callback, state);
      await this.discovery(entry.config);
      const r = await this.json(entry.config.auth.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: entry.config.auth.clientId,
          grant_type: 'authorization_code',
          code,
          code_verifier: verifier,
          redirect_uri: MOBILE_REDIRECT_URI,
        }).toString(),
      });
      if (!r.ok) return fail('LOGIN_FAILED');
      entry = await this.acceptTokens(entry, r.value);
      return this.me(entry);
    });
  whoami = (id: string) =>
    this.lock(async () => {
      const e = this.entry(id);
      await this.discovery(e.config);
      return this.me(await this.current(e));
    });
  refresh = (id: string) => this.lock(async () => this.me(await this.rotate(this.entry(id))));
  logout = (id: string) =>
    this.lock(async () => {
      const entry = this.entry(id);
      let remoteRevoked = !entry.session;
      try {
        if (entry.session) {
          await this.discovery(entry.config);
          const current = await this.current(entry);
          const r = await this.json(current.config.server + '/api/auth/logout', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + current.session!.accessToken },
          });
          remoteRevoked = r.ok && r.value.remoteRevoked === true;
        }
      } catch {}
      this.identities.delete(id);
      await this.save({ config: entry.config });
      return { localLoggedOut: true, remoteRevoked };
    });
}
