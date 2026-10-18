import { parseInvitationLink } from './invitation-link';
import { parsePendingWork, type PendingWork } from './work-contract';
import { parseAgent, parseAgentHandoff, validAgentId, type AgentHandoff } from './agent-contract';
import {
  parseInvitation,
  parsePendingInvitation,
  validInvitationId,
  type PendingInvitation,
} from './invitation-contract';
import {
  parseChannel,
  parseMessage,
  parsePendingChannelAction,
  validChannelId,
  type PendingChannelAction,
} from './channel-contract';
import {
  ClientError,
  connectionKey,
  MOBILE_REDIRECT_URI,
  parseInstance,
  type InstanceConfig,
} from './instance-contract';

export type Identity = { userId: string; instanceId: string; instanceRole: 'admin' | 'user' };
type Session = {
  accessToken: string;
  refreshToken: string;
  userId?: string | undefined;
  organizationId?: string | undefined;
};
export type Organization = {
  organizationId: string;
  name: string;
  description: string;
  version: number;
  role: 'owner' | 'member';
};
type Entry = {
  agentHandoff?: AgentHandoff | undefined;
  config: InstanceConfig;
  session?: Session;
  pendingCreate?: { name: string; operation: string } | undefined;
  pendingChannelAction?: PendingChannelAction | undefined;
  pendingInvitation?: PendingInvitation | undefined;
  pendingWork?: PendingWork | undefined;
};
type Vault = { version: 1; entries: Entry[] };
export type CloudRow = {
  agentHandoff?: Omit<AgentHandoff, 'secret'> | undefined;
  config: InstanceConfig;
  hasSession: boolean;
  sessionUserId?: string | undefined;
  identity?: Identity | undefined;
  organization?: Organization | undefined;
  pendingCreate?: { name: string; operation: string } | undefined;
  pendingChannelAction?: PendingChannelAction | undefined;
  pendingInvitation?: PendingInvitation | undefined;
  pendingWork?: PendingWork | undefined;
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
  digest(value: string): Promise<string>;
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
  private organizations = new Map<string, Organization>();
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
        sessionUserId: e.session?.userId,
        pendingCreate: e.pendingCreate,
        pendingChannelAction: e.pendingChannelAction,
        pendingInvitation: e.pendingInvitation,
        pendingWork: e.pendingWork,
        agentHandoff: e.agentHandoff
          ? {
              actorId: e.agentHandoff.actorId,
              organizationId: e.agentHandoff.organizationId,
              channelId: e.agentHandoff.channelId,
              ownerUserId: e.agentHandoff.ownerUserId,
              name: e.agentHandoff.name,
              operationId: e.agentHandoff.operationId,
              ready: e.agentHandoff.ready,
            }
          : undefined,
        identity: this.identities.get(e.config.instanceId),
        organization: this.organizations.get(e.config.instanceId),
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
            let pendingCreate: Entry['pendingCreate'];
            if (e.pendingCreate !== undefined) {
              const pending = record(e.pendingCreate);
              if (
                typeof pending.name !== 'string' ||
                pending.name.length > 80 ||
                typeof pending.operation !== 'string' ||
                !/^[A-Za-z0-9_-]{16,100}$/.test(pending.operation)
              )
                fail('INVALID_LOCAL_STATE');
              pendingCreate = {
                name: pending.name as string,
                operation: pending.operation as string,
              };
            }
            if (e.session === undefined) return { config, pendingCreate };
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
            if (
              saved.organizationId !== undefined &&
              (typeof saved.organizationId !== 'string' ||
                !/^org_[A-Za-z0-9]+$/.test(saved.organizationId))
            )
              fail('INVALID_LOCAL_STATE');
            return {
              config,
              pendingCreate,
              pendingChannelAction: parsePendingChannelAction(e.pendingChannelAction),
              pendingInvitation: parsePendingInvitation(e.pendingInvitation),
              pendingWork: parsePendingWork(e.pendingWork),
              agentHandoff: parseAgentHandoff(e.agentHandoff),
              session: {
                ...session,
                userId: saved.userId as string | undefined,
                organizationId: saved.organizationId as string | undefined,
              },
            };
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
  inspectInvitationService = (link: string) =>
    this.lock(async () => {
      const target = parseInvitationLink(link);
      const response = await this.json(target.server + '/.well-known/open-cloud-groups');
      if (!response.ok) return fail('INSTANCE_UNAVAILABLE');
      const config = parseInstance(response.value);
      if (config.server !== target.server) return fail('INVITATION_TARGET_MISMATCH');
      return config;
    });
  previewInvitation = (id: string, link: string) =>
    this.lock(async () => {
      const target = parseInvitationLink(link);
      const saved = this.entry(id);
      if (saved.config.server !== target.server) return fail('INVITATION_TARGET_MISMATCH');
      const entry = await this.current(saved);
      const value = parseInvitation(
        await this.orgRequest(
          entry,
          '/' + target.invitationId,
          {},
          target.guest ? '/api/channel-invitations' : '/api/invitations',
        ),
      );
      if (value.invitationId !== target.invitationId || (value.role === 'guest') !== target.guest)
        return fail('INVALID_RESPONSE');
      return value;
    });
  openChannel = (id: string, organizationId: string, channelId: string, guest = false) =>
    this.lock(async () => {
      if (!validChannelId(channelId)) return fail('INVALID_CHANNEL');
      const entry = guest
        ? await this.current(this.entry(id))
        : await this.channelEntry(id, organizationId);
      if (!this.identities.has(id)) await this.me(entry);
      const raw = await this.orgRequest(
        entry,
        (guest ? '' : '/' + organizationId + '/channels') + '/' + channelId,
        {},
        guest ? '/api/guest-channels' : '/api/organizations',
      );
      const channel = parseChannel(raw);
      if (
        channel.channelId !== channelId ||
        (guest && (raw.access !== 'guest' || channel.organizationId !== organizationId))
      )
        return fail('INVALID_RESPONSE');
      return channel;
    });
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
      if (changed) {
        this.identities.delete(config.instanceId);
        this.organizations.delete(config.instanceId);
      }
      await this.save({ ...(!changed ? old : {}), config });
      return config;
    });
  rename = (id: string, name: string) =>
    this.lock(async () => {
      const entry = this.entry(id);
      const config = parseInstance({ ...entry.config, name: name.trim() });
      await this.save({ ...entry, config });
    });
  private async acceptTokens(
    entry: Entry,
    value: unknown,
    organizationId = entry.session?.organizationId,
  ) {
    const session = { ...tokenPair(value), userId: entry.session?.userId, organizationId };
    await this.save({ ...entry, session });
    return this.entry(entry.config.instanceId);
  }
  private async rotate(entry: Entry, organizationId = entry.session?.organizationId) {
    if (!entry.session) return fail('NOT_LOGGED_IN');
    await this.discovery(entry.config);
    const r = await this.json(entry.config.auth.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: entry.config.auth.clientId,
        grant_type: 'refresh_token',
        refresh_token: entry.session.refreshToken,
        ...(organizationId ? { organization_id: organizationId } : {}),
      }).toString(),
    });
    if (!r.ok) {
      if (r.status === 400 && r.value.error === 'invalid_grant') {
        this.identities.delete(entry.config.instanceId);
        this.organizations.delete(entry.config.instanceId);
        await this.save({ config: entry.config });
        return fail('LOGIN_REQUIRED');
      }
      return fail('AUTH_RETRY_REQUIRED');
    }
    return this.acceptTokens(entry, r.value, organizationId);
  }
  private async current(entry: Entry) {
    if (!entry.session) return fail('NOT_LOGGED_IN');
    return nearExpiry(entry.session.accessToken, this.rt.now()) ? this.rotate(entry) : entry;
  }
  private async me(entry: Entry): Promise<Identity> {
    this.identities.delete(entry.config.instanceId);
    this.organizations.delete(entry.config.instanceId);
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
      (r.value.instanceRole !== 'admin' && r.value.instanceRole !== 'user') ||
      (entry.session.userId && entry.session.userId !== r.value.userId)
    )
      fail('IDENTITY_RESPONSE_MISMATCH');
    const identity: Identity = {
      userId: r.value.userId as string,
      instanceId: entry.config.instanceId,
      instanceRole: r.value.instanceRole === 'admin' ? 'admin' : 'user',
    };
    await this.save({
      ...entry,
      session: { ...entry.session, userId: identity.userId },
    });
    const onboarding = await this.json(entry.config.server + '/api/onboarding', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + entry.session.accessToken },
    });
    if (
      !onboarding.ok ||
      typeof onboarding.value.organizationId !== 'string' ||
      !/^org_[A-Za-z0-9]+$/.test(onboarding.value.organizationId)
    )
      fail('ONBOARDING_INCOMPLETE');
    if (entry.session.organizationId) {
      const organization = this.parseOrganization(
        await this.orgRequest(
          this.entry(entry.config.instanceId),
          '/' + entry.session.organizationId,
        ),
      );
      if (organization.organizationId !== entry.session.organizationId)
        fail('ORGANIZATION_TOKEN_MISMATCH');
      this.organizations.set(entry.config.instanceId, organization);
    }
    this.identities.set(entry.config.instanceId, identity);
    this.publish();
    return identity;
  }
  private parseOrganization(value: unknown): Organization {
    const v = record(value);
    if (
      typeof v.organizationId !== 'string' ||
      !/^org_[A-Za-z0-9]+$/.test(v.organizationId) ||
      typeof v.name !== 'string' ||
      typeof v.description !== 'string' ||
      !Number.isSafeInteger(v.version) ||
      (v.role !== 'owner' && v.role !== 'member')
    )
      fail('INVALID_RESPONSE');
    return v as Organization;
  }
  private async orgRequest(
    entry: Entry,
    path: string,
    init: RequestInit = {},
    prefix = '/api/organizations',
  ) {
    await this.discovery(entry.config);
    if (!entry.session) return fail('NOT_LOGGED_IN');
    const r = await this.json(entry.config.server + prefix + path, {
      ...init,
      headers: { ...init.headers, Authorization: 'Bearer ' + entry.session.accessToken },
    });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) this.organizations.delete(entry.config.instanceId);
      this.publish();
      const code = record(r.value.error).code;
      return fail(
        typeof code === 'string' && /^[A-Z_]{1,80}$/.test(code) ? code : 'ORGANIZATION_UNAVAILABLE',
      );
    }
    return r.value;
  }
  listOrganizations = (id: string, after?: string) =>
    this.lock(async () => {
      const entry = await this.current(this.entry(id));
      const result = await this.orgRequest(
        entry,
        after ? '?after=' + encodeURIComponent(after) : '',
      );
      if (
        !Array.isArray(result.organizations) ||
        (result.nextCursor !== null &&
          (typeof result.nextCursor !== 'string' || !/^om_[A-Za-z0-9]+$/.test(result.nextCursor)))
      )
        fail('INVALID_RESPONSE');
      return {
        organizations: (result.organizations as unknown[]).map((v) => this.parseOrganization(v)),
        nextCursor: result.nextCursor as string | null,
      };
    });
  createOrganization = (id: string, name: string) =>
    this.lock(async () => {
      name = name.trim();
      if (!name || name.length > 80 || [...name].some((char) => char.charCodeAt(0) < 32))
        fail('INVALID_ORGANIZATION_INPUT');
      let entry = await this.current(this.entry(id));
      if (entry.pendingCreate && entry.pendingCreate.name !== name)
        fail('PENDING_ORGANIZATION_CREATE');
      const pendingCreate = entry.pendingCreate ?? { name, operation: this.rt.random() };
      await this.save({ ...entry, pendingCreate });
      entry = this.entry(id);
      const operation = pendingCreate.operation;
      const result = await this.orgRequest(entry, '', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': operation },
        body: JSON.stringify({ name }),
      });
      if (
        result.created !== true ||
        typeof result.organizationId !== 'string' ||
        !/^org_[A-Za-z0-9]+$/.test(result.organizationId)
      )
        fail('INVALID_RESPONSE');
      await this.save({ ...entry, pendingCreate: undefined });
      return result.organizationId as string;
    });
  useOrganization = (id: string, organizationId: string) =>
    this.lock(async () => {
      if (!/^org_[A-Za-z0-9]+$/.test(organizationId)) fail('INVALID_ORGANIZATION');
      let entry = await this.current(this.entry(id));
      await this.orgRequest(entry, '/' + organizationId + '/access');
      this.organizations.delete(id);
      this.publish();
      entry = await this.rotate(entry, organizationId);
      await this.me(entry);
      return this.organizations.get(id)!;
    });
  updateOrganization = (id: string, description: string, version: number) =>
    this.lock(async () => {
      const entry = await this.current(this.entry(id));
      if (!entry.session?.organizationId) return fail('ORGANIZATION_NOT_SELECTED');
      const result = this.parseOrganization(
        await this.orgRequest(entry, '/' + entry.session.organizationId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description, version }),
        }),
      );
      if (result.organizationId !== entry.session.organizationId)
        fail('ORGANIZATION_TOKEN_MISMATCH');
      this.organizations.set(id, result);
      this.publish();
      return result;
    });
  private async channelEntry(id: string, organizationId: string) {
    const entry = await this.current(this.entry(id));
    if (
      !/^org_[A-Za-z0-9]+$/.test(organizationId) ||
      entry.session?.organizationId !== organizationId ||
      !entry.session.userId
    )
      return fail('ORGANIZATION_TOKEN_REQUIRED');
    return entry;
  }
  listChannels = (id: string, organizationId: string, after?: string, guest = false) =>
    this.lock(async () => {
      const entry = guest
        ? await this.current(this.entry(id))
        : await this.channelEntry(id, organizationId);
      if (guest && organizationId && !/^org_[A-Za-z0-9]+$/.test(organizationId))
        return fail('INVALID_ORGANIZATION');
      const query = new URLSearchParams();
      if (after) query.set('after', after);
      if (guest && organizationId) query.set('organizationId', organizationId);
      const value = await this.orgRequest(
        entry,
        (guest ? '' : '/' + organizationId + '/channels') +
          (query.size ? '?' + query.toString() : ''),
        {},
        guest ? '/api/guest-channels' : '/api/organizations',
      );
      if (
        !Array.isArray(value.channels) ||
        value.channels.length > 50 ||
        (value.nextCursor !== null &&
          !(guest
            ? typeof value.nextCursor === 'string' && /^ci_[a-f0-9]{64}$/.test(value.nextCursor)
            : validChannelId(value.nextCursor)))
      )
        return fail('INVALID_RESPONSE');
      return {
        channels: value.channels.map((raw) => {
          const channel = parseChannel(raw);
          if (
            guest &&
            (!/^org_[A-Za-z0-9]+$/.test(channel.organizationId ?? '') ||
              record(raw).access !== 'guest' ||
              (organizationId && channel.organizationId !== organizationId))
          )
            return fail('INVALID_RESPONSE');
          return channel;
        }),
        nextCursor: value.nextCursor as string | null,
      };
    });
  readMessages = (
    id: string,
    organizationId: string,
    channelId: string,
    after = 0,
    guest = false,
  ) =>
    this.lock(async () => {
      if (!validChannelId(channelId) || !Number.isSafeInteger(after) || after < 0)
        return fail('INVALID_CURSOR');
      const entry = guest
        ? await this.current(this.entry(id))
        : await this.channelEntry(id, organizationId);
      const value = await this.orgRequest(
        entry,
        (guest ? '' : '/' + organizationId + '/channels') +
          '/' +
          channelId +
          '/messages?after=' +
          after,
        {},
        guest ? '/api/guest-channels' : '/api/organizations',
      );
      if (
        !Array.isArray(value.messages) ||
        value.messages.length > 50 ||
        !Number.isSafeInteger(value.nextCursor) ||
        Number(value.nextCursor) < after ||
        typeof value.hasMore !== 'boolean'
      )
        return fail('INVALID_RESPONSE');
      const messages = value.messages.map(parseMessage);
      if (
        messages.some(
          (m, index) => m.sequence <= (index ? messages[index - 1]!.sequence : after),
        ) ||
        (messages.length
          ? value.nextCursor !== messages.at(-1)?.sequence
          : !guest && value.nextCursor !== after)
      )
        return fail('INVALID_RESPONSE');
      return { messages, nextCursor: value.nextCursor as number, hasMore: value.hasMore };
    });
  private async channelMutation(
    id: string,
    organizationId: string,
    kind: PendingChannelAction['kind'],
    value: string,
    channelId?: string,
  ) {
    const guest = kind === 'guest.send';
    let entry = guest
      ? await this.current(this.entry(id))
      : await this.channelEntry(id, organizationId);
    if (!entry.session?.userId || !/^org_[A-Za-z0-9]+$/.test(organizationId))
      return fail('ORGANIZATION_TOKEN_REQUIRED');
    if (
      !value.trim() ||
      value.length > (kind === 'channel.create' ? 80 : 4000) ||
      (kind !== 'channel.create' && !validChannelId(channelId))
    )
      return fail('INVALID_CHANNEL_INPUT');
    const pending = entry.pendingChannelAction;
    if (
      pending &&
      (pending.kind !== kind ||
        pending.organizationId !== organizationId ||
        pending.userId !== entry.session!.userId ||
        pending.channelId !== channelId ||
        pending.value !== value)
    )
      return fail('PENDING_CHANNEL_ACTION');
    const action: PendingChannelAction = pending ?? {
      kind,
      organizationId,
      userId: entry.session!.userId!,
      channelId,
      value,
      operation: this.rt.random(),
    };
    await this.save({ ...entry, pendingChannelAction: action });
    entry = this.entry(id);
    const result = await this.orgRequest(
      entry,
      (guest ? '' : '/' + organizationId + '/channels') +
        (channelId ? '/' + channelId + '/messages' : ''),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': action.operation },
        body: JSON.stringify(kind === 'channel.create' ? { name: value } : { text: value }),
      },
      guest ? '/api/guest-channels' : '/api/organizations',
    );
    const parsed = kind === 'channel.create' ? parseChannel(result) : parseMessage(result.message);
    if (
      kind === 'channel.create'
        ? result.organizationId !== organizationId
        : record(result.message).authorId !== action.userId ||
          record(result.message).operationId !== action.operation ||
          record(result.message).text !== value
    )
      return fail('INVALID_RESPONSE');
    await this.save({ ...entry, pendingChannelAction: undefined });
    return parsed;
  }
  createChannel = (id: string, organizationId: string, name: string) =>
    this.lock(async () =>
      parseChannel(await this.channelMutation(id, organizationId, 'channel.create', name.trim())),
    );
  sendMessage = (
    id: string,
    organizationId: string,
    channelId: string,
    text: string,
    guest = false,
  ) =>
    this.lock(async () =>
      parseMessage(
        await this.channelMutation(
          id,
          organizationId,
          guest ? 'guest.send' : 'message.send',
          text,
          channelId,
        ),
      ),
    );
  requestHealthCheck = (
    id: string,
    organizationId: string,
    channelId: string,
    targetActorId: string,
  ) =>
    this.lock(async () => {
      let entry = await this.channelEntry(id, organizationId);
      if (!validChannelId(channelId) || !validAgentId(targetActorId))
        return fail('INVALID_WORK_INPUT');
      const pending = entry.pendingWork;
      if (
        pending &&
        (pending.organizationId !== organizationId ||
          pending.channelId !== channelId ||
          pending.userId !== entry.session?.userId ||
          pending.targetActorId !== targetActorId)
      )
        return fail('PENDING_WORK_REQUEST');
      const action: PendingWork = pending ?? {
        organizationId,
        channelId,
        targetActorId,
        userId: entry.session!.userId!,
        expiresAt: new Date(this.rt.now() + 300000).toISOString(),
        operation: this.rt.random(),
      };
      parsePendingWork(action);
      await this.save({ ...entry, pendingWork: action });
      entry = this.entry(id);
      const result = await this.orgRequest(
        entry,
        '/' + organizationId + '/channels/' + channelId + '/work-requests',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': action.operation },
          body: JSON.stringify({
            targetActorId,
            capability: 'health-check',
            expiresAt: action.expiresAt,
          }),
        },
      );
      const message = parseMessage(result.message),
        raw = record(result.message),
        request = record(raw.payload);
      const requestId =
        'wr_' +
        (await this.rt.digest(JSON.stringify([channelId, action.userId, action.operation])));
      if (
        message.authorType !== 'human' ||
        message.authorId !== action.userId ||
        message.operationId !== action.operation ||
        raw.kind !== 'work_request' ||
        request.version !== 1 ||
        request.requestId !== requestId ||
        request.channelId !== channelId ||
        request.requesterUserId !== action.userId ||
        request.targetActorId !== targetActorId ||
        request.capability !== 'health-check' ||
        request.expiresAt !== action.expiresAt
      )
        return fail('INVALID_RESPONSE');
      await this.save({ ...entry, pendingWork: undefined });
      return message;
    });
  clearPendingWork = (id: string) =>
    this.lock(async () => {
      await this.save({ ...this.entry(id), pendingWork: undefined });
    });
  listAgents = (id: string, organizationId: string, channelId: string, after?: string) =>
    this.lock(async () => {
      const entry = await this.channelEntry(id, organizationId);
      if (!validChannelId(channelId) || (after && !validAgentId(after)))
        return fail('INVALID_AGENT_INPUT');
      const value = await this.orgRequest(
        entry,
        '/' +
          organizationId +
          '/channels/' +
          channelId +
          '/agents' +
          (after ? '?after=' + after : ''),
      );
      if (
        !Array.isArray(value.agents) ||
        value.agents.length > 50 ||
        (value.nextCursor !== null && !validAgentId(value.nextCursor))
      )
        return fail('INVALID_AGENT_RESPONSE');
      const agents = value.agents.map(parseAgent);
      if (new Set(agents.map((a) => a.actorId)).size !== agents.length)
        return fail('INVALID_AGENT_RESPONSE');
      return { agents, nextCursor: value.nextCursor as string | null };
    });
  createAgent = (id: string, organizationId: string, channelId: string, name: string) =>
    this.lock(async () => {
      let entry = await this.channelEntry(id, organizationId);
      name = name.trim();
      if (
        !validChannelId(channelId) ||
        !name ||
        name.length > 80 ||
        Array.from(name).some((c) => c.charCodeAt(0) < 32)
      )
        return fail('INVALID_AGENT_INPUT');
      let action = entry.agentHandoff;
      if (
        action &&
        (action.ownerUserId !== entry.session!.userId ||
          action.organizationId !== organizationId ||
          action.channelId !== channelId ||
          action.name !== name)
      )
        return fail('AGENT_HANDOFF_PENDING');
      if (!action) {
        const operationId = this.rt.random();
        action = {
          actorId:
            'ag_' +
            (await this.rt.digest(JSON.stringify([channelId, entry.session!.userId, operationId]))),
          organizationId,
          channelId,
          ownerUserId: entry.session!.userId!,
          name,
          operationId,
          secret: await this.rt.digest(this.rt.random()),
          ready: false,
        };
        parseAgentHandoff(action);
        await this.save({ ...entry, agentHandoff: action });
        entry = this.entry(id);
      }
      const agent = parseAgent(
        await this.orgRequest(entry, '/' + organizationId + '/channels/' + channelId + '/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': action.operationId },
          body: JSON.stringify({ name, secretHash: await this.rt.digest(action.secret) }),
        }),
      );
      if (
        agent.actorId !== action.actorId ||
        agent.name !== name ||
        agent.ownerUserId !== action.ownerUserId
      )
        return fail('INVALID_AGENT_RESPONSE');
      if (agent.state !== 'active') return fail('AGENT_ACCESS_DENIED');
      await this.save({ ...this.entry(id), agentHandoff: { ...action, ready: true } });
      return agent;
    });
  exportAgentCredential = async (
    id: string,
    organizationId: string,
    channelId: string,
    name: string,
  ) => {
    await this.createAgent(id, organizationId, channelId, name);
    return this.lock(async () => {
      const entry = await this.channelEntry(id, organizationId),
        action = entry.agentHandoff;
      if (
        !action?.ready ||
        action.channelId !== channelId ||
        action.organizationId !== organizationId ||
        action.ownerUserId !== entry.session!.userId ||
        action.name !== name.trim()
      )
        return fail('AGENT_HANDOFF_PENDING');
      const { ready: _ready, ...credential } = action;
      return JSON.stringify({ version: 1, config: entry.config, ...credential });
    });
  };
  clearAgentHandoff = (id: string) =>
    this.lock(async () => {
      const entry = this.entry(id);
      await this.save({ ...entry, agentHandoff: undefined });
    });
  revokeAgent = (id: string, organizationId: string, channelId: string, actorId: string) =>
    this.lock(async () => {
      const entry = await this.channelEntry(id, organizationId);
      if (!validChannelId(channelId) || !validAgentId(actorId)) return fail('INVALID_AGENT_INPUT');
      const agent = parseAgent(
        await this.orgRequest(
          entry,
          '/' + organizationId + '/channels/' + channelId + '/agents/' + actorId + '/revoke',
          { method: 'POST' },
        ),
      );
      if (agent.actorId !== actorId || agent.state !== 'revoked')
        return fail('INVALID_AGENT_RESPONSE');
      if (entry.agentHandoff?.actorId === actorId)
        await this.save({ ...this.entry(id), agentHandoff: undefined });
      return agent;
    });
  listInvitations = (
    id: string,
    organizationId?: string,
    after?: string,
    channel?: string | true,
  ) =>
    this.lock(async () => {
      const entry = organizationId
        ? await this.channelEntry(id, organizationId)
        : await this.current(this.entry(id));
      if (channel && organizationId && (typeof channel !== 'string' || !validChannelId(channel)))
        return fail('INVALID_CHANNEL');
      if (after && !validInvitationId(after)) return fail('INVALID_CURSOR');
      const prefix = organizationId
        ? '/api/organizations/' +
          organizationId +
          (channel ? '/channels/' + channel + '/guest-invitations' : '/invitations')
        : channel
          ? '/api/channel-invitations'
          : '/api/invitations';
      const value = await this.orgRequest(
        entry,
        after ? '?after=' + encodeURIComponent(after) : '',
        {},
        prefix,
      );
      if (
        !Array.isArray(value.invitations) ||
        value.invitations.length > 50 ||
        (value.nextCursor !== null && !validInvitationId(value.nextCursor))
      )
        return fail('INVALID_RESPONSE');
      const invitations = value.invitations.map(parseInvitation);
      if (
        invitations.some(
          (v) =>
            v.role !== (channel ? 'guest' : 'member') ||
            (organizationId && v.organizationId !== organizationId) ||
            (typeof channel === 'string' && v.channelId !== channel),
        )
      )
        return fail('INVALID_RESPONSE');
      return { invitations, nextCursor: value.nextCursor as string | null };
    });
  sendInvitation = (id: string, organizationId: string, email: string, channelId?: string) =>
    this.lock(async () => {
      let entry = await this.channelEntry(id, organizationId);
      if (channelId !== undefined && !validChannelId(channelId)) return fail('INVALID_CHANNEL');
      email = email.trim().toLowerCase();
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return fail('INVALID_INVITATION_INPUT');
      const pending = entry.pendingInvitation;
      if (
        pending &&
        (pending.userId !== entry.session!.userId ||
          pending.organizationId !== organizationId ||
          pending.email !== email ||
          pending.channelId !== channelId)
      )
        return fail('PENDING_INVITATION');
      const action = pending ?? {
        channelId,
        organizationId,
        userId: entry.session!.userId!,
        email,
        operation: this.rt.random(),
      };
      await this.save({ ...entry, pendingInvitation: action });
      entry = this.entry(id);
      const value = parseInvitation(
        await this.orgRequest(
          entry,
          '/' +
            organizationId +
            (channelId ? '/channels/' + channelId + '/guest-invitations' : '/invitations'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Idempotency-Key': action.operation },
            body: JSON.stringify({ email }),
          },
        ),
      );
      if (
        value.organizationId !== organizationId ||
        value.email.toLowerCase() !== email ||
        value.channelId !== channelId ||
        value.role !== (channelId ? 'guest' : 'member')
      )
        return fail('INVALID_RESPONSE');
      await this.save({ ...entry, pendingInvitation: undefined });
      return value;
    });
  acceptInvitation = (id: string, invitationId: string, guest = false) =>
    this.lock(async () => {
      if (!validInvitationId(invitationId) || invitationId.startsWith('ci_') !== guest)
        return fail('INVALID_INVITATION');
      const entry = await this.current(this.entry(id));
      const raw = await this.orgRequest(
        entry,
        '/' + invitationId + '/accept',
        { method: 'POST' },
        guest ? '/api/channel-invitations' : '/api/invitations',
      );
      const value = parseInvitation(raw);
      if (
        value.invitationId !== invitationId ||
        value.state !== 'accepted' ||
        raw.accepted !== true ||
        value.role !== (guest ? 'guest' : 'member')
      )
        return fail('INVALID_RESPONSE');
      return value;
    });
  revokeInvitation = (
    id: string,
    organizationId: string,
    invitationId: string,
    channelId?: string,
  ) =>
    this.lock(async () => {
      if (!validInvitationId(invitationId)) return fail('INVALID_INVITATION');
      const entry = await this.channelEntry(id, organizationId);
      const value = parseInvitation(
        await this.orgRequest(
          entry,
          '/' +
            organizationId +
            (channelId ? '/channels/' + channelId + '/guest-invitations/' : '/invitations/') +
            invitationId +
            '/revoke',
          { method: 'POST' },
        ),
      );
      if (
        value.invitationId !== invitationId ||
        value.organizationId !== organizationId ||
        !['revoked', 'expired'].includes(value.state) ||
        value.channelId !== channelId ||
        value.role !== (channelId ? 'guest' : 'member')
      )
        return fail('INVALID_RESPONSE');
      return value;
    });
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
      this.organizations.delete(id);
      await this.save({ config: entry.config });
      return { localLoggedOut: true, remoteRevoked };
    });
}
