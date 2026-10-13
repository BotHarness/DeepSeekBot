import { randomUUID } from 'node:crypto';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { z } from 'zod';

import { dmChannelId } from '../channels/channel.js';
import type { ChannelStore, ChannelAppendOnceResult } from '../channels/store.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import type { PrivateInputLog } from './diagnostics.js';
import type { PrivateInputOrigin, PrivateReplyAuthority } from './im-origin.js';
import { PrivateAccountBindings, type PrivateAccountScope } from './account-bindings.js';
import {
  privateRequestSchema,
  privateSubmissionSchema,
  type PrivateInputDeclaration,
  type PrivateInputResult,
  type PrivateInputStatus,
  type PrivateAccountStatus,
  type PrivateAccountSummary,
  type PrivateRevocationResult,
} from './contracts.js';

const grantFields = {
  botSlug: z.string(),
  botCreatedAt: z.string(),
  account: z.string(),
  values: z.record(z.string(), z.string()),
};
const storedGrant = z.discriminatedUnion('version', [
  z.strictObject({ version: z.literal(1), ...grantFields }),
  z.strictObject({
    version: z.literal(2),
    ...grantFields,
    channelId: z.string(),
    requestMessageId: z.string().uuid(),
  }),
  z.strictObject({
    version: z.literal(3),
    ...grantFields,
    channelId: z.string(),
    requestMessageId: z.string().uuid(),
  }),
]);
const referencePattern = /^private:([0-9a-f-]{36}):([a-z][a-z0-9_]{0,47})$/;
type Terminal = 'cancelled' | 'expired';
type Pending = {
  agent: Agent | undefined;
  botSlug: string;
  botCreatedAt: string;
  request: PrivateInputDeclaration;
  expectedRevision: string | undefined;
  signal: AbortSignal;
  origin?: PrivateInputOrigin;
  deadline: number;
  committed: boolean;
  commit?: Promise<ChannelAppendOnceResult>;
  terminal?: Terminal;
  operation?: Promise<boolean> | undefined;
  abort(): void;
  resolve(result: PrivateInputResult): void;
};
type PrivateUse = {
  scope: PrivateAccountScope;
  controller: AbortController;
  done: Promise<'stopped' | 'completed'>;
  origin?: PrivateInputOrigin;
};
export class PrivateInputs {
  readonly #pending = new Map<string, Pending>();
  readonly #timer: ReturnType<typeof setInterval>;
  #recovery: Promise<void> | undefined;
  #closed = false;
  readonly #accounts: PrivateAccountBindings;
  readonly #uses = new Set<PrivateUse>();
  readonly #completed = new Set<string>();
  readonly #origins = new WeakMap<Agent, Map<string, Map<string, PrivateInputOrigin>>>();
  readonly #replyScopes = new Set<{
    scope: PrivateAccountScope;
    origin: PrivateInputOrigin;
    controller: AbortController;
    ready(): boolean;
    dispose(): void;
  }>();

  constructor(
    readonly deps: {
      channels: ChannelStore;
      ownership: SessionOwnership;
      registry: PersonaBotRegistry;
      credentials(): CredentialProvider | undefined;
      isLive(agent: Agent): boolean;
      canRequest(agent: Agent, sourceEventId?: string): boolean;
      origin?(agent: Agent, sourceEventId?: string): PrivateInputOrigin | undefined;
      notify?(
        botSlug: string,
        origin: PrivateInputOrigin,
        channelId: string,
        messageId: string,
      ): Promise<void>;
      replyAuthority?(
        botSlug: string,
        sourceEventId: string,
        authority: PrivateReplyAuthority,
      ): () => void;
      qualified(): Promise<boolean>;
      log: PrivateInputLog;
      requestTimeoutMs?: number;
      changed?(botSlug: string, count: number): void;
    },
  ) {
    this.#accounts = new PrivateAccountBindings(deps.credentials);
    const timeout = deps.requestTimeoutMs ?? 15 * 60_000;
    if (!Number.isSafeInteger(timeout) || timeout < 1)
      throw new Error('Invalid private input lifetime');
    this.#timer = setInterval(
      () => {
        for (const [id, pending] of this.#pending) {
          if (!this.#valid(pending)) void this.#stop(id, pending, 'expired');
        }
        for (const use of this.#uses)
          if (use.origin !== undefined && !use.origin.current()) use.controller.abort();
        for (const reply of this.#replyScopes)
          if (!reply.origin.applies()) {
            reply.controller.abort();
            reply.dispose();
            this.#replyScopes.delete(reply);
          }
      },
      Math.min(timeout, 1000),
    );
    this.#timer.unref();
  }

  #owner(agent: Agent): { botSlug: string; createdAt: string } | undefined {
    const owner = this.deps.ownership.resolve(agent.session.id);
    const bot = owner === undefined ? undefined : this.deps.registry.get(owner.botSlug);
    if (
      this.#closed ||
      owner?.rootRole !== 'orchestrator' ||
      bot === undefined ||
      !this.deps.isLive(agent)
    )
      return undefined;
    return { botSlug: owner.botSlug, createdAt: bot.createdAt };
  }

  #valid(pending: Pending): boolean {
    const bot = this.deps.registry.get(pending.botSlug);
    const owner =
      pending.agent === undefined
        ? bot === undefined || this.#closed
          ? undefined
          : { botSlug: bot.slug, createdAt: bot.createdAt }
        : this.#owner(pending.agent);
    return (
      pending.terminal === undefined &&
      !pending.signal.aborted &&
      (pending.origin === undefined || pending.origin.current()) &&
      Date.now() < pending.deadline &&
      owner?.botSlug === pending.botSlug &&
      owner.createdAt === pending.botCreatedAt &&
      this.deps.channels.get(dmChannelId(pending.botSlug))?.botSlug === pending.botSlug
    );
  }

  #scope(pending: Pending): PrivateAccountScope {
    return {
      botSlug: pending.botSlug,
      botCreatedAt: pending.botCreatedAt,
      account: pending.request.account,
    };
  }

  #guardReply(
    agent: Agent,
    scope: PrivateAccountScope,
    origin: PrivateInputOrigin,
    ready: () => boolean,
  ): void {
    if (this.deps.replyAuthority === undefined) return;
    const controller = new AbortController();
    const dispose = this.deps.replyAuthority(scope.botSlug, origin.sourceEventId, {
      signal: controller.signal,
      current: () =>
        !controller.signal.aborted &&
        origin.current() &&
        this.#owner(agent)?.createdAt === scope.botCreatedAt &&
        ready(),
    });
    this.#replyScopes.add({ scope, origin, controller, ready, dispose });
  }

  #resolution(channelId: string, messageId: string) {
    return this.deps.channels.message(channelId, 'private-resolution-' + messageId)
      ?.privateInputResolution;
  }

  #publish(botSlug: string): void {
    const count = [...this.#pending.entries()].filter(
      ([id, pending]) =>
        pending.botSlug === botSlug &&
        pending.committed &&
        this.#valid(pending) &&
        this.#resolution(dmChannelId(botSlug), id) === undefined,
    ).length;
    try {
      this.deps.changed?.(botSlug, count);
    } catch {
      this.deps.log('attention-publication-failed', { botSlug });
    }
  }

  activeMessageIds(): string[] {
    return [...this.#pending.entries()].flatMap(([id, pending]) =>
      pending.committed && this.status(dmChannelId(pending.botSlug), id) === 'pending' ? [id] : [],
    );
  }

  #grantCommitted(grant: z.infer<typeof storedGrant>, id: string): boolean {
    if (grant.version === 1) return true;
    if (grant.channelId !== dmChannelId(grant.botSlug)) return false;
    const card = this.deps.channels.message(grant.channelId, grant.requestMessageId);
    const request = card?.privateInputRequest;
    const resolution = this.#resolution(grant.channelId, grant.requestMessageId);
    const configured = Object.entries(grant.values).filter(([, value]) => value.length > 0);
    return (
      card?.author.kind === 'bot' &&
      card.author.slug === grant.botSlug &&
      request?.account === grant.account &&
      resolution?.state === 'configured' &&
      configured.length === Object.keys(resolution.references).length &&
      configured.every(
        ([field]) =>
          request.fields.some((declared) => declared.id === field) &&
          resolution.references[field] === `private:${id}:${field}`,
      ) &&
      request.fields.every((field) => !field.required || (grant.values[field.id]?.length ?? 0) > 0)
    );
  }

  recover(): Promise<void> {
    if (this.#closed) return Promise.reject(new Error('Private input owner is closed'));
    if (this.#recovery !== undefined) return this.#recovery;
    this.#recovery = this.#recover().catch(() => {
      this.#recovery = undefined;
      this.deps.log('recovery-failed');
      throw new Error('Private input recovery is unavailable');
    });
    return this.#recovery;
  }

  async #recover(): Promise<void> {
    const credentials = this.deps.credentials();
    if (credentials === undefined) throw new Error('Credential provider is unavailable');
    for (const channel of this.deps.channels.list()) {
      if (channel.type !== 'dm' || channel.botSlug === undefined) continue;
      let cursor: string | undefined;
      do {
        const page = this.deps.channels.queryMessages(channel.id, {
          limit: 100,
          ...(cursor === undefined ? {} : { cursor }),
        });
        for (const message of page.messages) {
          if (
            message.privateInputRequest === undefined ||
            this.#pending.has(message.id) ||
            this.#resolution(channel.id, message.id) !== undefined
          )
            continue;
          const result = await this.deps.channels.appendMessageOnce(channel.id, {
            id: 'private-resolution-' + message.id,
            at: new Date().toISOString(),
            author: { kind: 'human' },
            replyTo: message.id,
            body: 'Private input expired',
            privateInputResolution: {
              requestMessageId: message.id,
              state: 'expired',
              references: {},
            },
          });
          if (result.status !== 'appended' && result.status !== 'existing')
            throw new Error('Private request reconciliation failed');
          this.deps.log('recovered-expired', { requestId: message.id, botSlug: channel.botSlug });
        }
        cursor = page.nextCursor;
      } while (cursor !== undefined);
      this.#publish(channel.botSlug);
    }
    for (const entry of await credentials.listRecords()) {
      const id = /^botharness-private\/grant-([0-9a-f-]{36})$/.exec(entry.key)?.[1];
      if (id === undefined || entry.kind !== 'grant') continue;
      const record = await credentials.readRecord(entry.key);
      const grant = storedGrant.safeParse(record?.kind === 'grant' ? record.payload : undefined);
      const binding =
        grant.success && grant.data.version === 3
          ? await this.#accounts.read(grant.data)
          : undefined;
      if (
        grant.success &&
        grant.data.version !== 1 &&
        (!this.#grantCommitted(grant.data, id) ||
          (grant.data.version === 3 && binding?.grantId !== id))
      ) {
        await credentials.deleteRecord(entry.key);
        this.deps.log('orphan-grant-removed', { requestId: id });
      }
    }
  }

  async ask(
    agent: Agent,
    input: unknown,
    signal: AbortSignal,
    sourceEventId?: string,
  ): Promise<PrivateInputResult> {
    const request = privateRequestSchema.safeParse(input);
    const owner = this.#owner(agent);
    if (!request.success || owner === undefined || signal.aborted)
      throw new Error('Private input request is invalid or unavailable');
    const origin = this.deps.origin?.(agent, sourceEventId);
    if (origin !== undefined) {
      if (!origin.current() || this.deps.notify === undefined)
        throw new Error('Private input IM handoff is unavailable');
      let origins = this.#origins.get(agent);
      if (origins === undefined) {
        origins = new Map();
        this.#origins.set(agent, origins);
      }
      let accountOrigins = origins.get(request.data.account);
      if (accountOrigins === undefined) {
        accountOrigins = new Map();
        origins.set(request.data.account, accountOrigins);
      }
      for (const [id, previous] of accountOrigins)
        if (!previous.applies()) accountOrigins.delete(id);
      accountOrigins.set(origin.sourceEventId, origin);
    }
    await this.recover();
    if (!(await this.deps.qualified()) || this.deps.credentials() === undefined)
      throw new Error('Protected credential consumption is unavailable in this Profile');
    const currentOwner = this.#owner(agent);
    if (
      signal.aborted ||
      (origin !== undefined && !origin.current()) ||
      currentOwner?.botSlug !== owner.botSlug ||
      currentOwner.createdAt !== owner.createdAt
    )
      throw new Error('Private input request expired');
    const channelId = dmChannelId(owner.botSlug);
    if (this.deps.channels.get(channelId)?.botSlug !== owner.botSlug)
      throw new Error('Owned conversation is unavailable');
    const scope = {
      botSlug: owner.botSlug,
      botCreatedAt: owner.createdAt,
      account: request.data.account,
    };
    const existing = await this.#accounts.serial(scope, async () => {
      const binding = await this.#accounts.read(scope);
      if (binding?.grantId === undefined || binding.grantId === null) return { binding };
      const record = await this.deps
        .credentials()
        ?.readRecord(credentialKey('botharness-private', 'grant-' + binding.grantId));
      const grant = storedGrant.safeParse(record?.kind === 'grant' ? record.payload : undefined);
      if (
        !grant.success ||
        grant.data.botSlug !== scope.botSlug ||
        grant.data.botCreatedAt !== scope.botCreatedAt ||
        grant.data.account !== scope.account ||
        !this.#grantCommitted(grant.data, binding.grantId) ||
        request.data.fields.some(
          (field) => field.required && (grant.data.values[field.id]?.length ?? 0) === 0,
        )
      )
        return { binding };
      const references = Object.fromEntries(
        request.data.fields
          .filter((field) => (grant.data.values[field.id]?.length ?? 0) > 0)
          .map((field) => [field.id, `private:${binding.grantId}:${field.id}`]),
      );
      if (origin !== undefined) this.#guardReply(agent, scope, origin, () => true);
      return { binding, references };
    });
    const reuseOwner = this.#owner(agent);
    if (
      signal.aborted ||
      (origin !== undefined && !origin.current()) ||
      reuseOwner?.createdAt !== owner.createdAt ||
      reuseOwner.botSlug !== owner.botSlug
    )
      throw new Error('Private input request expired');
    if (existing.references !== undefined) {
      return {
        status: 'configured',
        account: request.data.account,
        references: existing.references,
      };
    }
    if (!this.deps.canRequest(agent, sourceEventId)) {
      this.deps.log('owner-action-required', {
        botSlug: owner.botSlug,
        sessionId: agent.session.id,
      });
      throw new Error(
        'Private account requires Owner action in an interactive conversation; do not retry this unattended request',
      );
    }
    const binding = existing.binding;
    const opened = await this.#open(
      agent,
      owner,
      request.data,
      signal,
      binding?.revision,
      undefined,
      origin,
    );
    if (origin !== undefined && this.status(channelId, opened.messageId) === 'pending') {
      try {
        await this.deps.notify!(owner.botSlug, origin, channelId, opened.messageId);
        this.deps.log('im-notice-settled', { botSlug: owner.botSlug, requestId: opened.messageId });
      } catch {
        const pending = this.#pending.get(opened.messageId);
        if (pending !== undefined) await this.#stop(opened.messageId, pending, 'expired');
        this.deps.log('im-notice-unavailable', {
          botSlug: owner.botSlug,
          requestId: opened.messageId,
        });
      }
    }
    const result = await opened.result;
    return origin !== undefined && !origin.current()
      ? { status: 'expired', account: request.data.account, references: {} }
      : result;
  }

  async #open(
    agent: Agent | undefined,
    owner: { botSlug: string; createdAt: string },
    request: PrivateInputDeclaration,
    signal: AbortSignal,
    expectedRevision: string | undefined,
    replacesMessageId?: string,
    origin?: PrivateInputOrigin,
  ): Promise<{ messageId: string; result: Promise<PrivateInputResult> }> {
    const channelId = dmChannelId(owner.botSlug);
    const id = randomUUID();
    let resolve!: Pending['resolve'];
    const result = new Promise<PrivateInputResult>((done) => {
      resolve = done;
    });
    const pending: Pending = {
      agent,
      botSlug: owner.botSlug,
      botCreatedAt: owner.createdAt,
      request,
      expectedRevision,
      signal,
      ...(origin === undefined ? {} : { origin }),
      committed: false,
      deadline: Date.now() + (this.deps.requestTimeoutMs ?? 15 * 60_000),
      resolve,
      abort: () => {
        void this.#stop(id, pending, 'expired');
      },
    };
    this.#pending.set(id, pending);
    if (agent !== undefined && origin !== undefined)
      this.#guardReply(
        agent,
        this.#scope(pending),
        origin,
        () => this.#resolution(channelId, id)?.state === 'configured',
      );
    signal.addEventListener('abort', pending.abort, { once: true });
    origin?.signal.addEventListener('abort', pending.abort, { once: true });
    try {
      pending.commit = this.deps.channels.appendMessageOnce(channelId, {
        id,
        at: new Date().toISOString(),
        author: { kind: 'bot', slug: owner.botSlug },
        body: request.purpose,
        privateInputRequest: {
          ...request,
          ...(agent === undefined ? {} : { sessionId: agent.session.id }),
          expiresAt: new Date(pending.deadline).toISOString(),
          ...(replacesMessageId === undefined ? {} : { replacesMessageId }),
        },
      });
      const committed = await pending.commit;
      if (committed.status !== 'appended')
        throw new Error('Private input request could not be saved');
      pending.committed = true;
      this.#publish(pending.botSlug);
      this.deps.log('requested', {
        requestId: id,
        botSlug: owner.botSlug,
        ...(agent === undefined ? {} : { sessionId: agent.session.id }),
      });
      if (!this.#valid(pending)) await this.#stop(id, pending, pending.terminal ?? 'expired');
      return { messageId: id, result };
    } catch {
      signal.removeEventListener('abort', pending.abort);
      origin?.signal.removeEventListener('abort', pending.abort);
      if (this.#pending.get(id) === pending) {
        this.#pending.delete(id);
        this.#publish(pending.botSlug);
      }
      throw new Error('Private input request could not be opened');
    }
  }

  status(channelId: string, messageId: string): PrivateInputStatus {
    const resolution = this.#resolution(channelId, messageId);
    if (resolution !== undefined) return resolution.state;
    const pending = this.#pending.get(messageId);
    if (pending !== undefined && channelId === dmChannelId(pending.botSlug) && pending.committed) {
      if (this.#valid(pending)) return 'pending';
      void this.#stop(messageId, pending, pending.terminal ?? 'expired');
    }
    return 'expired';
  }

  #finish(id: string, pending: Pending, result: PrivateInputResult): void {
    pending.signal.removeEventListener('abort', pending.abort);
    pending.origin?.signal.removeEventListener('abort', pending.abort);
    this.#pending.delete(id);
    pending.resolve(result);
    this.#publish(pending.botSlug);
    this.deps.log(result.status, {
      requestId: id,
      botSlug: pending.botSlug,
      ...(pending.agent === undefined ? {} : { sessionId: pending.agent.session.id }),
    });
  }

  async #terminal(id: string, pending: Pending): Promise<boolean> {
    const state = pending.terminal ?? 'expired';
    const channelId = dmChannelId(pending.botSlug);
    let committed = false;
    try {
      const result = await this.deps.channels.appendMessageOnce(channelId, {
        id: 'private-resolution-' + id,
        at: new Date().toISOString(),
        author: { kind: 'human' },
        replyTo: id,
        body: state === 'cancelled' ? 'Private input cancelled' : 'Private input expired',
        privateInputResolution: { requestMessageId: id, state, references: {} },
      });
      committed =
        (result.status === 'appended' || result.status === 'existing') &&
        result.message.privateInputResolution?.state === state;
    } catch {
      committed = this.#resolution(channelId, id)?.state === state;
      if (!committed)
        this.deps.log('terminal-save-failed', { requestId: id, botSlug: pending.botSlug });
    }
    this.#finish(id, pending, {
      status: committed ? state : 'expired',
      account: pending.request.account,
      references: {},
    });
    return committed;
  }

  async #stop(id: string, pending: Pending, state: Terminal): Promise<boolean> {
    if (this.#pending.get(id) !== pending) return false;
    const resolution = this.#resolution(dmChannelId(pending.botSlug), id);
    if (resolution !== undefined) {
      if (pending.operation !== undefined) await pending.operation;
      else
        this.#finish(id, pending, {
          status: resolution.state === 'configured' ? 'expired' : resolution.state,
          account: pending.request.account,
          references: {},
        });
      return false;
    }
    pending.terminal ??= state;
    if (!pending.committed) {
      try {
        if (pending.commit === undefined) return false;
        const result = await pending.commit;
        if (result.status !== 'appended') return false;
        pending.committed = true;
      } catch {
        return false;
      }
    }
    if (pending.operation !== undefined) {
      await pending.operation;
      return this.#resolution(dmChannelId(pending.botSlug), id)?.state === state;
    }
    pending.operation = this.#terminal(id, pending);
    try {
      return await pending.operation;
    } finally {
      pending.operation = undefined;
    }
  }

  async submit(owner: boolean, input: unknown): Promise<boolean> {
    if (!owner) return false;
    await this.recover();
    const parsed = privateSubmissionSchema.safeParse(input);
    if (!parsed.success) return false;
    const { channelId, messageId, values } = parsed.data;
    const pending = this.#pending.get(messageId);
    if (
      pending === undefined ||
      pending.operation !== undefined ||
      channelId !== dmChannelId(pending.botSlug) ||
      this.status(channelId, messageId) !== 'pending'
    )
      return false;
    const fields = pending.request.fields;
    if (
      Object.keys(values).some((key) => !fields.some((field) => field.id === key)) ||
      fields.some((field) => field.required && (values[field.id]?.length ?? 0) === 0)
    )
      return false;
    const credentials = this.deps.credentials();
    if (credentials === undefined) return false;
    pending.operation = this.#accounts.serial(this.#scope(pending), () =>
      this.#submit(channelId, messageId, pending, credentials, values),
    );
    try {
      return await pending.operation;
    } finally {
      pending.operation = undefined;
    }
  }

  async #submit(
    channelId: string,
    id: string,
    pending: Pending,
    credentials: CredentialProvider,
    values: Record<string, string>,
  ): Promise<boolean> {
    const grantId = randomUUID();
    const key = credentialKey('botharness-private', 'grant-' + grantId);
    const references = Object.fromEntries(
      pending.request.fields
        .filter((field) => (values[field.id]?.length ?? 0) > 0)
        .map((field) => [field.id, `private:${grantId}:${field.id}`]),
    );
    let configured = false;
    let activated = false;
    let writeAttempted = false;
    let stopping: Promise<Omit<PrivateRevocationResult, 'accepted'>> | undefined;
    try {
      if (!(await this.deps.qualified()) || !this.#valid(pending))
        throw new Error('Private input expired');
      if ((await this.#accounts.read(this.#scope(pending)))?.revision !== pending.expectedRevision)
        throw new Error('Private account version changed');
      await credentials.modifyRecord(key, async (current) => {
        if (current !== undefined || !this.#valid(pending))
          throw new Error('Private grant unavailable');
        writeAttempted = true;
        return {
          kind: 'grant',
          payload: {
            version: 3,
            botSlug: pending.botSlug,
            botCreatedAt: pending.botCreatedAt,
            account: pending.request.account,
            channelId,
            requestMessageId: id,
            values: { ...values },
          },
        };
      });
      if (!this.#valid(pending)) throw new Error('Private input expired');
      await this.#accounts.commit(this.#scope(pending), pending.expectedRevision, grantId, () =>
        this.#valid(pending),
      );
      activated = true;
      stopping = this.#stopUses(this.#scope(pending), 'replacement');
      try {
        await this.deps.channels.appendMessageOnce(
          channelId,
          {
            id: 'private-resolution-' + id,
            at: new Date().toISOString(),
            author: { kind: 'human' },
            replyTo: id,
            body: 'Private information configured',
            privateInputResolution: { requestMessageId: id, state: 'configured', references },
          },
          undefined,
          undefined,
          () => this.#valid(pending),
        );
      } catch {
        const resolution = this.#resolution(channelId, id);
        if (
          resolution?.state !== 'configured' ||
          JSON.stringify(resolution.references) !== JSON.stringify(references)
        )
          throw new Error('Private input was not committed');
      }
      const committed = this.#resolution(channelId, id);
      if (
        committed?.state !== 'configured' ||
        JSON.stringify(committed.references) !== JSON.stringify(references)
      )
        throw new Error('Private input was not committed');
    } catch {
      this.deps.log('submit-failed', {
        requestId: id,
        botSlug: pending.botSlug,
        ...(pending.agent === undefined ? {} : { sessionId: pending.agent.session.id }),
      });
    } finally {
      await stopping;
      const resolution = this.#resolution(channelId, id);
      if (!activated) {
        activated = await this.#accounts.read(this.#scope(pending)).then(
          (binding) => binding?.grantId === grantId,
          () => false,
        );
      }
      configured =
        activated &&
        resolution?.state === 'configured' &&
        JSON.stringify(resolution.references) === JSON.stringify(references);
      if (configured) {
        this.#finish(id, pending, {
          status: this.#valid(pending) ? 'configured' : 'expired',
          account: pending.request.account,
          references: this.#valid(pending) ? references : {},
        });
      } else {
        if (writeAttempted)
          await credentials
            .deleteRecord(key)
            .catch(() => this.deps.log('cleanup-failed', { requestId: id }));
        pending.terminal ??= 'expired';
        await this.#terminal(id, pending);
      }
      for (const field of Object.keys(values)) delete values[field];
    }
    return configured;
  }

  async cancel(owner: boolean, channelId: string, messageId: string): Promise<boolean> {
    const pending = this.#pending.get(messageId);
    if (
      !owner ||
      pending === undefined ||
      channelId !== dmChannelId(pending.botSlug) ||
      this.status(channelId, messageId) !== 'pending'
    )
      return false;
    return this.#stop(messageId, pending, 'cancelled');
  }

  async consume<T>(
    agent: Agent,
    account: string,
    references: Record<string, string>,
    run: (values: Record<string, string>, signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    await this.recover();
    const owner = this.#owner(agent);
    if (owner === undefined || !(await this.deps.qualified()))
      throw new Error('Protected credential consumption is unavailable');
    const entries = Object.entries(references);
    if (entries.length === 0 || entries.length > 8)
      throw new Error('Credential references are invalid');
    const matches = entries.map(([field, ref]) => ({ field, match: referencePattern.exec(ref) }));
    const id = matches[0]?.match?.[1];
    if (
      id === undefined ||
      matches.some(({ field, match }) => match?.[1] !== id || match?.[2] !== field)
    )
      throw new Error('Credential references are invalid');
    const scope = { botSlug: owner.botSlug, botCreatedAt: owner.createdAt, account };
    const remembered = [...(this.#origins.get(agent)?.get(account)?.values() ?? [])].filter(
      (origin) => origin.applies(),
    );
    if (remembered.length > 1) throw new Error('Private input IM source is ambiguous');
    const origin = remembered[0] ?? this.deps.origin?.(agent);
    if (origin !== undefined && !origin.current())
      throw new Error('Private input IM authority changed');
    const startedUse = await this.#accounts
      .serial(scope, async () => {
        const record = await this.deps
          .credentials()
          ?.readRecord(credentialKey('botharness-private', 'grant-' + id));
        const grant = storedGrant.safeParse(record?.kind === 'grant' ? record.payload : undefined);
        if (
          !grant.success ||
          grant.data.botSlug !== owner.botSlug ||
          grant.data.botCreatedAt !== owner.createdAt ||
          grant.data.account !== account ||
          !this.#grantCommitted(grant.data, id) ||
          matches.some(({ field }) => grant.data.values[field] === undefined)
        )
          throw new Error('Credential grant is unavailable for this PersonaBot and account');
        const binding = await this.#accounts.read(scope);
        if (
          (binding !== undefined && binding.grantId !== id) ||
          (grant.data.version === 3 && binding?.grantId !== id)
        )
          throw new Error('Credential grant is unavailable for this PersonaBot and account');
        const currentOwner = this.#owner(agent);
        if (currentOwner?.botSlug !== owner.botSlug || currentOwner.createdAt !== owner.createdAt)
          throw new Error('Credential authority changed');
        if (signal?.aborted) throw new Error('Protected credential consumer was cancelled');
        if (origin !== undefined && !origin.current())
          throw new Error('Private input IM authority changed');
        if (origin !== undefined) this.#guardReply(agent, scope, origin, () => true);
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal?.addEventListener('abort', abort, { once: true });
        origin?.signal.addEventListener('abort', abort, { once: true });
        const resolved = Object.fromEntries(
          matches.map(({ field }) => [field, grant.data.values[field]!]),
        );
        let settle!: (outcome: 'stopped' | 'completed') => void;
        const done = new Promise<'stopped' | 'completed'>((resolve) => {
          settle = resolve;
        });
        const use: PrivateUse = {
          scope,
          controller,
          done,
          ...(origin === undefined ? {} : { origin }),
        };
        this.#uses.add(use);
        this.#completed.delete(this.#accounts.key(scope));
        const promise = Promise.resolve()
          .then(() => {
            if (controller.signal.aborted || (origin !== undefined && !origin.current()))
              throw new Error('Protected credential consumer was cancelled');
            return run(resolved, controller.signal);
          })
          .then(
            (result) => {
              if (origin !== undefined && (controller.signal.aborted || !origin.current())) {
                settle('completed');
                throw new Error('Private input IM authority changed');
              }
              settle('completed');
              return result;
            },
            (error: unknown) => {
              settle(controller.signal.aborted ? 'stopped' : 'completed');
              throw error;
            },
          )
          .finally(() => {
            for (const field of Object.keys(resolved)) delete resolved[field];
            signal?.removeEventListener('abort', abort);
            origin?.signal.removeEventListener('abort', abort);
            this.#uses.delete(use);
            this.#completed.add(this.#accounts.key(scope));
            if (this.#completed.size > 100)
              this.#completed.delete(this.#completed.values().next().value!);
          });
        return { promise };
      })
      .catch(() => {
        throw new Error('Credential grant is unavailable for this PersonaBot and account');
      });
    const started = Date.now();
    const details = { requestId: id, botSlug: owner.botSlug, sessionId: agent.session.id };
    this.deps.log('consume-started', details);
    try {
      const result = await startedUse.promise;
      this.deps.log('consume-completed', { ...details, durationMs: Date.now() - started });
      return result;
    } catch {
      this.deps.log('consume-failed', { ...details, durationMs: Date.now() - started });
      throw new Error('Protected credential consumer failed or was cancelled');
    }
  }

  #configuredCard(channelId: string, messageId: string) {
    const card = this.deps.channels.message(channelId, messageId);
    const request = card?.privateInputRequest;
    const resolution = this.#resolution(channelId, messageId);
    const bot = card?.author.kind === 'bot' ? this.deps.registry.get(card.author.slug) : undefined;
    const references = resolution?.references;
    const grantId =
      references === undefined
        ? undefined
        : referencePattern.exec(Object.values(references)[0] ?? '')?.[1];
    if (
      this.#closed ||
      bot === undefined ||
      channelId !== dmChannelId(bot.slug) ||
      this.deps.channels.get(channelId)?.botSlug !== bot.slug ||
      request === undefined ||
      resolution?.state !== 'configured' ||
      grantId === undefined
    )
      return undefined;
    return {
      scope: { botSlug: bot.slug, botCreatedAt: bot.createdAt, account: request.account },
      grantId,
      request,
      references: resolution.references,
    };
  }

  async accountStatus(
    owner: boolean,
    channelId: string,
    messageId: string,
  ): Promise<PrivateAccountStatus> {
    if (!owner) return { status: 'unavailable', references: {} };
    const card = this.#configuredCard(channelId, messageId);
    if (card === undefined) return { status: 'unavailable', references: {} };
    return this.#accounts.serial(card.scope, async () => {
      const binding = await this.#accounts.read(card.scope);
      if (binding?.grantId === null) return { status: 'revoked', references: {} };
      if (binding !== undefined && binding.grantId !== card.grantId)
        return { status: 'superseded', references: {} };
      const record = await this.deps
        .credentials()
        ?.readRecord(credentialKey('botharness-private', 'grant-' + card.grantId));
      const grant = storedGrant.safeParse(record?.kind === 'grant' ? record.payload : undefined);
      if (
        !grant.success ||
        grant.data.botSlug !== card.scope.botSlug ||
        grant.data.botCreatedAt !== card.scope.botCreatedAt ||
        grant.data.account !== card.scope.account ||
        !this.#grantCommitted(grant.data, card.grantId) ||
        (grant.data.version === 3 && binding?.grantId !== card.grantId)
      )
        return { status: 'unavailable', references: {} };
      return { status: 'configured', references: card.references };
    });
  }

  async accounts(owner: boolean, botSlug: string): Promise<PrivateAccountSummary[] | undefined> {
    if (!owner) return undefined;
    const bot = this.deps.registry.get(botSlug);
    if (bot === undefined || this.#closed) return [];
    try {
      await this.recover();
      const credentials = this.deps.credentials();
      if (credentials === undefined) return undefined;
      const bindings = await this.#accounts.list(bot.slug, bot.createdAt);
      const rows: PrivateAccountSummary[] = [];
      for (const listed of bindings) {
        const scope = { botSlug: bot.slug, botCreatedAt: bot.createdAt, account: listed.account };
        const row = await this.#accounts.serial(scope, async () => {
          const binding = await this.#accounts.read(scope);
          if (binding?.grantId === undefined || binding.grantId === null) return undefined;
          const grantId = binding.grantId;
          const record = await credentials.readRecord(
            credentialKey('botharness-private', 'grant-' + grantId),
          );
          const grant = storedGrant.safeParse(
            record?.kind === 'grant' ? record.payload : undefined,
          );
          const card =
            grant.success && grant.data.version !== 1
              ? {
                  channelId: grant.data.channelId,
                  messageId: grant.data.requestMessageId,
                  request: this.deps.channels.message(
                    grant.data.channelId,
                    grant.data.requestMessageId,
                  )?.privateInputRequest,
                }
              : undefined;
          const verified =
            grant.success &&
            card !== undefined &&
            grant.data.botSlug === scope.botSlug &&
            grant.data.botCreatedAt === scope.botCreatedAt &&
            grant.data.account === scope.account &&
            this.#grantCommitted(grant.data, grantId);
          const replacement = [...this.#pending.entries()].find(
            ([, pending]) =>
              pending.agent === undefined &&
              pending.committed &&
              pending.botSlug === scope.botSlug &&
              pending.botCreatedAt === scope.botCreatedAt &&
              pending.request.account === scope.account &&
              pending.expectedRevision === binding.revision &&
              this.#valid(pending),
          );
          const request = verified ? card.request : undefined;
          const configuredAt = verified
            ? this.deps.channels.message(card.channelId, 'private-resolution-' + card.messageId)?.at
            : undefined;
          return {
            account: scope.account,
            ...(request === undefined ? {} : { purpose: request.purpose }),
            fields:
              request?.fields.map((field) => ({
                id: field.id,
                label: field.label,
                required: field.required,
              })) ?? [],
            status: !verified
              ? 'unavailable'
              : replacement === undefined
                ? 'configured'
                : 'replacing',
            ...(configuredAt === undefined ? {} : { configuredAt }),
            ...(verified ? { channelId: card.channelId, messageId: card.messageId } : {}),
            ...(verified && replacement !== undefined
              ? { replacementMessageId: replacement[0] }
              : {}),
          } satisfies PrivateAccountSummary;
        });
        if (row !== undefined) rows.push(row);
      }
      return rows.sort((left, right) => left.account.localeCompare(right.account));
    } catch {
      this.deps.log('account-list-failed', { botSlug });
      return undefined;
    }
  }

  async replaceable(): Promise<boolean> {
    return !this.#closed && this.deps.credentials() !== undefined && (await this.deps.qualified());
  }

  async replace(owner: boolean, channelId: string, messageId: string): Promise<string | undefined> {
    if (!owner || !(await this.deps.qualified())) return undefined;
    await this.recover();
    const card = this.#configuredCard(channelId, messageId);
    if (card === undefined) return undefined;
    return this.#accounts.serial(card.scope, async () => {
      const binding = await this.#accounts.read(card.scope);
      if (binding !== undefined && binding.grantId !== card.grantId) return undefined;
      const pending = [...this.#pending.entries()].find(
        ([, request]) =>
          request.agent === undefined &&
          request.botSlug === card.scope.botSlug &&
          request.botCreatedAt === card.scope.botCreatedAt &&
          request.request.account === card.scope.account &&
          request.expectedRevision === binding?.revision &&
          this.#valid(request),
      );
      if (pending !== undefined) return pending[0];
      const record = await this.deps
        .credentials()
        ?.readRecord(credentialKey('botharness-private', 'grant-' + card.grantId));
      const grant = storedGrant.safeParse(record?.kind === 'grant' ? record.payload : undefined);
      if (
        !grant.success ||
        grant.data.botCreatedAt !== card.scope.botCreatedAt ||
        grant.data.botSlug !== card.scope.botSlug ||
        grant.data.account !== card.scope.account ||
        !this.#grantCommitted(grant.data, card.grantId) ||
        (grant.data.version === 3 && binding?.grantId !== card.grantId)
      )
        return undefined;
      const opened = await this.#open(
        undefined,
        { botSlug: card.scope.botSlug, createdAt: card.scope.botCreatedAt },
        {
          account: card.request.account,
          purpose: card.request.purpose,
          fields: card.request.fields,
        },
        new AbortController().signal,
        binding?.revision,
        messageId,
      );
      return opened.messageId;
    });
  }

  async #stopUses(
    scope: PrivateAccountScope,
    initiator: 'replacement' | 'revocation',
  ): Promise<Omit<PrivateRevocationResult, 'accepted'>> {
    const started = Date.now();
    for (const reply of this.#replyScopes)
      if (this.#accounts.key(reply.scope) === this.#accounts.key(scope) && reply.ready())
        reply.controller.abort();
    const uses = [...this.#uses].filter(
      (use) => this.#accounts.key(use.scope) === this.#accounts.key(scope),
    );
    const summary = {
      stopped: 0,
      completed: uses.length === 0 && this.#completed.has(this.#accounts.key(scope)) ? 1 : 0,
      uncertain: 0,
    };
    for (const use of uses) use.controller.abort();
    this.deps.log('consumer-stop-requested', {
      botSlug: scope.botSlug,
      initiator,
      active: uses.length,
    });
    await Promise.all(
      uses.map(async (use) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<'uncertain'>((resolve) => {
          timer = setTimeout(() => resolve('uncertain'), 1000);
        });
        const outcome = await Promise.race([use.done, timeout]);
        clearTimeout(timer);
        summary[outcome] += 1;
      }),
    );
    this.deps.log('consumer-stop-settled', {
      botSlug: scope.botSlug,
      initiator,
      durationMs: Date.now() - started,
      ...summary,
    });
    return summary;
  }

  async revoke(
    owner: boolean,
    channelId: string,
    messageId: string,
  ): Promise<PrivateRevocationResult> {
    const refused = { accepted: false, stopped: 0, completed: 0, uncertain: 0 };
    if (!owner) return refused;
    await this.recover();
    const card = this.#configuredCard(channelId, messageId);
    if (card === undefined) return refused;
    const accepted = await this.#accounts.serial(card.scope, async () => {
      const binding = await this.#accounts.read(card.scope);
      if (binding !== undefined && binding.grantId !== card.grantId) return undefined;
      const record = await this.deps
        .credentials()
        ?.readRecord(credentialKey('botharness-private', 'grant-' + card.grantId));
      const grant = storedGrant.safeParse(record?.kind === 'grant' ? record.payload : undefined);
      if (
        !grant.success ||
        grant.data.botCreatedAt !== card.scope.botCreatedAt ||
        grant.data.botSlug !== card.scope.botSlug ||
        grant.data.account !== card.scope.account ||
        !this.#grantCommitted(grant.data, card.grantId) ||
        (grant.data.version === 3 && binding?.grantId !== card.grantId)
      )
        return undefined;
      await this.#accounts.commit(
        card.scope,
        binding?.revision,
        null,
        () =>
          this.#configuredCard(channelId, messageId)?.scope.botCreatedAt ===
          card.scope.botCreatedAt,
      );
      this.deps.log('account-revoked', { botSlug: card.scope.botSlug, requestId: card.grantId });
      await this.deps
        .credentials()
        ?.deleteRecord(credentialKey('botharness-private', 'grant-' + card.grantId))
        .catch(() => this.deps.log('cleanup-failed', { requestId: card.grantId }));
      return { stopping: this.#stopUses(card.scope, 'revocation') };
    });
    if (!accepted) return refused;
    const summary = await accepted.stopping;
    await this.deps.channels
      .appendMessageOnce(channelId, {
        id: 'private-revocation-' + randomUUID(),
        at: new Date().toISOString(),
        author: { kind: 'human' },
        replyTo: messageId,
        body: `Private account access revoked locally. Stopped: ${summary.stopped}; already completed: ${summary.completed}; uncertain: ${summary.uncertain}. Remote token validity and completed effects are unchanged.`,
      })
      .catch(() =>
        this.deps.log('revocation-report-failed', {
          botSlug: card.scope.botSlug,
          requestId: card.grantId,
        }),
      );
    return { accepted: true, ...summary };
  }

  async eraseBot(botSlug: string): Promise<number> {
    const bot = this.deps.registry.getHistorical(botSlug);
    const credentials = this.deps.credentials();
    if (bot === undefined || credentials === undefined) return 0;
    await this.recover();
    for (const [id, pending] of this.#pending)
      if (pending.botSlug === bot.slug && pending.botCreatedAt === bot.createdAt)
        await this.#stop(id, pending, 'cancelled');
    let erased = 0;
    for (const listed of await this.#accounts.list(bot.slug, bot.createdAt)) {
      const scope = { botSlug: bot.slug, botCreatedAt: bot.createdAt, account: listed.account };
      await this.#accounts.serial(scope, async () => {
        const binding = await this.#accounts.read(scope);
        if (binding === undefined) return;
        await this.#stopUses(scope, 'revocation');
        if (binding.grantId !== null) {
          await credentials.deleteRecord(
            credentialKey('botharness-private', 'grant-' + binding.grantId),
          );
          erased += 1;
        }
        await credentials.deleteRecord(this.#accounts.key(scope));
      });
    }
    for (const entry of await credentials.listRecords()) {
      if (entry.kind !== 'grant' || !/^botharness-private\/grant-[0-9a-f-]{36}$/.test(entry.key))
        continue;
      const record = await credentials.readRecord(entry.key);
      const grant = storedGrant.safeParse(record?.kind === 'grant' ? record.payload : undefined);
      if (
        grant.success &&
        grant.data.botSlug === bot.slug &&
        grant.data.botCreatedAt === bot.createdAt
      ) {
        await credentials.deleteRecord(entry.key);
        erased += 1;
      }
    }
    this.deps.log('bot-accounts-erased', { botSlug: bot.slug, completed: erased });
    return erased;
  }

  async close(): Promise<void> {
    this.#closed = true;
    clearInterval(this.#timer);
    for (const reply of this.#replyScopes) {
      reply.controller.abort();
      reply.dispose();
    }
    this.#replyScopes.clear();
    for (const use of this.#uses) use.controller.abort();
    await Promise.all(
      [...this.#pending.entries()].map(([id, pending]) => this.#stop(id, pending, 'expired')),
    );
    await this.#recovery?.catch(() => undefined);
    await this.#accounts.drain();
  }
}
