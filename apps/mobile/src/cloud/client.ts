import { parseInvitationLink } from './invitation-link';
import { parsePendingWork, type PendingWork } from './work-contract';
import { parseAgent, parseAgentHandoff, validAgentId } from './agent-contract';
import { parseInvitation, validInvitationId } from './invitation-contract';
import {
  parseChannel,
  parseMessage,
  validChannelId,
  type PendingChannelAction,
} from './channel-contract';
import {
  connectionKey,
  MOBILE_REDIRECT_URI,
  parseInstance,
  type InstanceConfig,
} from './instance-contract';
import {
  type Vault,
  type Identity,
  type Organization,
  type CloudSnapshot,
  cloudRows,
  decodeVault,
  type Entry,
} from './client-storage';
import { fail, cloudError, requestJson, record } from './client-transport';
import { checkDiscovery, parseCloudQr } from './client-instance';
import { tokenPair, nearExpiry, login } from './client-auth';
export type { Identity, Organization, CloudRow, CloudSnapshot } from './client-storage';
export { cloudError, canRetainCloudCache } from './client-transport';
export { parseCloudQr, configurationChanges } from './client-instance';
export { callbackCode } from './client-auth';

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
      rows: cloudRows(this.vault, this.identities, this.organizations),
    };
    for (const listener of this.listeners) listener();
  }
  load = (): Promise<void> =>
    (this.loadPromise ??= (async () => {
      try {
        const raw = await this.rt.read();
        if (raw) {
          this.vault = decodeVault(raw);
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
  private json(url: string, init: RequestInit = {}) {
    return requestJson(this.rt, url, init);
  }
  private discovery(config: InstanceConfig) {
    return checkDiscovery((url) => this.json(url), config);
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
    const session = {
      ...tokenPair(value),
      userId: entry.session?.userId,
      organizationId: organizationId || undefined,
    };
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
      return this.channelPage(entry, organizationId, after, guest);
    });
  listConversationChannels = (id: string, organizationId: string, after?: string, guest = false) =>
    this.lock(async () => {
      let entry = await this.current(this.entry(id));
      if (guest) return this.channelPage(entry, organizationId, after, true);
      if (!/^org_[A-Za-z0-9]+$/.test(organizationId)) return fail('INVALID_ORGANIZATION');
      const previous = entry.session?.organizationId ?? '';
      if (previous === organizationId) return this.channelPage(entry, organizationId, after, false);
      await this.orgRequest(entry, '/' + organizationId + '/access');
      entry = await this.rotate(entry, organizationId);
      let result: Awaited<ReturnType<CloudClient['channelPage']>>;
      let restoreFailed = false;
      try {
        result = await this.channelPage(entry, organizationId, after, false);
      } finally {
        try {
          await this.rotate(this.entry(id), previous);
        } catch {
          this.organizations.delete(id);
          this.publish();
          restoreFailed = true;
        }
      }
      if (restoreFailed) return fail('ORGANIZATION_RESTORE_REQUIRED');
      return result;
    });
  private async channelPage(
    entry: Entry,
    organizationId: string,
    after: string | undefined,
    guest: boolean,
  ) {
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
  }
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
    this.lock(() =>
      login(
        {
          rt: this.rt,
          getEntry: (id) => this.entry(id),
          discovery: (config) => this.discovery(config),
          json: (url, init) => this.json(url, init),
          acceptTokens: (entry, value) => this.acceptTokens(entry, value),
          me: (entry) => this.me(entry),
        },
        id,
      ),
    );
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
