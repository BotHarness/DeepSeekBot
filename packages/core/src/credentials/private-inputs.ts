import type { ApprovalAuthority } from '../team/approval-contract.js';
import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
import { randomUUID } from 'node:crypto';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';
import type { z } from 'zod';

import { dmChannelId } from '../channels/channel.js';
import type { ChannelStore } from '../channels/store.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import { type PrivateInputLog } from './diagnostics.js';
import {
  PrivateInputRefusal,
  type PrivateInputOrigin,
  type PrivateReplyAuthority,
} from './im-origin.js';
import { PrivateAccountBindings, type PrivateAccountScope } from './account-bindings.js';
import { privateReference } from './references.js';
import {
  privateRequestSchema,
  privateSubmissionSchema,
  type PrivateInputDeclaration,
  type PrivateInputResult,
  type PrivateInputStatus,
  type PrivateAccountStatus,
  type PrivateAccountSummary,
  type PrivateRevocationResult,
  type PrivateSubmissionRefusal,
  type PrivateSubmissionResult,
} from './contracts.js';
import {
  accountStatus,
  accounts,
  consume,
  eraseBot,
  replace,
  revoke,
  stopUses,
  storedGrant,
  type AccountOperations,
} from './private-input-account-operations.js';
import type { Pending, PrivateReplyScope, PrivateUse, Terminal } from './private-input-types.js';

export class PrivateInputs {
  mcpServers?: {
    list(botSlug: string): Array<{
      serverName: string;
      account: string;
      program: string;
      args: string[];
      approvedAt: string;
      connected: boolean;
      enabled: boolean;
      own: boolean;
      ownerSlug: string;
      ownerName: string;
    }>;
    setEnabled(botSlug: string, serverName: string, enabled: boolean): Promise<boolean>;
    remove(botSlug: string, serverName: string): Promise<boolean>;
    erase(botSlug: string): Promise<void>;
  };
  readonly #pending = new Map<string, Pending>();
  readonly #timer: ReturnType<typeof setInterval>;
  #recovery: Promise<void> | undefined;
  #closed = false;
  readonly #accounts: PrivateAccountBindings;
  readonly #uses = new Set<PrivateUse>();
  readonly #completed = new Set<string>();
  readonly #origins = new WeakMap<Agent, Map<string, Map<string, PrivateInputOrigin>>>();
  readonly #replyScopes = new Set<PrivateReplyScope>();
  readonly #accountOperations: AccountOperations;

  constructor(
    readonly deps: {
      approvals?: ApprovalAuthority;
      channels: ChannelStore;
      ownership: SessionOwnership;
      registry: PersonaBotRegistry;
      credentials(): CredentialProvider | undefined;
      isLive(agent: Agent): boolean;
      canRequest(agent: Agent, sourceEventId?: string): boolean;
      askChannel?(sessionId: string): string | undefined;
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
    this.#accountOperations = {
      inputs: this,
      isClosed: () => this.#closed,
      accounts: this.#accounts,
      pending: this.#pending,
      origins: this.#origins,
      uses: this.#uses,
      completed: this.#completed,
      replyScopes: this.#replyScopes,
      owner: (agent) => this.#owner(agent),
      cardChannel: (botSlug, channelId) => this.#cardChannel(botSlug, channelId),
      resolution: (channelId, messageId) => this.#resolution(channelId, messageId),
      grantCommitted: (grant, id) => this.#grantCommitted(grant, id),
      guardReply: (agent, scope, origin, ready) => this.#guardReply(agent, scope, origin, ready),
      valid: (pending) => this.#valid(pending),
      open: (...args) => this.#open(...args),
      publish: (botSlug) => this.#publish(botSlug),
      stop: (id, pending, state) => this.#stop(id, pending, state),
    };
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
      this.#cardChannel(pending.botSlug, pending.channelId)
    );
  }

  #cardChannel(botSlug: string, channelId: string): boolean {
    const channel = this.deps.channels.get(channelId);
    if (channel === undefined) return false;
    return channel.type === 'group'
      ? channel.members.includes(botSlug)
      : channelId === dmChannelId(botSlug) && channel.botSlug === botSlug;
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
        this.#resolution(pending.channelId, id) === undefined,
    ).length;
    try {
      this.deps.changed?.(botSlug, count);
    } catch {
      this.deps.log('attention-publication-failed', { botSlug });
    }
  }

  activeMessageIds(): string[] {
    return [...this.#pending.entries()].flatMap(([id, pending]) =>
      pending.committed && this.status(pending.channelId, id) === 'pending' ? [id] : [],
    );
  }

  #grantCommitted(grant: z.infer<typeof storedGrant>, id: string): boolean {
    if (grant.version === 1) return true;
    if (!this.#cardChannel(grant.botSlug, grant.channelId)) return false;
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
          resolution.references[field] === privateReference(id, field),
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

  #scanRequests(dms: readonly { id: string }[]): Array<{ channelId: string; messageId: string }> {
    const requests: Array<{ channelId: string; messageId: string }> = [];
    for (const channel of dms) {
      let cursor: string | undefined;
      do {
        const page = this.deps.channels.queryMessages(channel.id, {
          limit: 100,
          ...(cursor === undefined ? {} : { cursor }),
        });
        for (const message of page.messages)
          if (message.privateInputRequest !== undefined)
            requests.push({ channelId: channel.id, messageId: message.id });
        cursor = page.nextCursor;
      } while (cursor !== undefined);
    }
    return requests;
  }

  async #recover(): Promise<void> {
    const credentials = this.deps.credentials();
    if (credentials === undefined) throw new Error('Credential provider is unavailable');
    const dms = this.deps.channels
      .list()
      .filter((channel) => channel.type === 'dm' && channel.botSlug !== undefined);
    const requests = this.deps.channels.privateInputRequests?.() ?? this.#scanRequests(dms);
    const botOf = new Map(dms.map((channel) => [channel.id, channel.botSlug!]));
    for (const { channelId, messageId } of requests) {
      const botSlug = botOf.get(channelId);
      if (
        botSlug === undefined ||
        this.#pending.has(messageId) ||
        this.#resolution(channelId, messageId) !== undefined
      )
        continue;
      const result = await this.deps.channels.appendMessageOnce(OWNER_HUMAN_CONTEXT, channelId, {
        id: 'private-resolution-' + messageId,
        at: new Date().toISOString(),
        author: { kind: 'human' },
        replyTo: messageId,
        body: 'Private input expired',
        privateInputResolution: {
          requestMessageId: messageId,
          state: 'expired',
          references: {},
        },
      });
      if (result.status !== 'appended' && result.status !== 'existing')
        throw new Error('Private request reconciliation failed');
      this.deps.log('recovered-expired', { requestId: messageId, botSlug });
    }
    for (const botSlug of new Set(botOf.values())) this.#publish(botSlug);
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
      if (!origin.current()) throw new PrivateInputRefusal('private-source-revoked');
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
    const asked = this.deps.askChannel?.(agent.session.id);
    const channelId =
      asked !== undefined && this.deps.channels.get(asked)?.type === 'group'
        ? asked
        : dmChannelId(owner.botSlug);
    if (!this.#cardChannel(owner.botSlug, channelId))
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
      const grantId = binding.grantId;
      const references = Object.fromEntries(
        request.data.fields
          .filter((field) => (grant.data.values[field.id]?.length ?? 0) > 0)
          .map((field) => [field.id, privateReference(grantId, field.id)]),
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
    if (origin !== undefined && this.deps.notify === undefined)
      throw new PrivateInputRefusal('private-input-notice-unavailable');
    const binding = existing.binding;
    const opened = await this.#open(
      agent,
      owner,
      request.data,
      signal,
      binding?.revision,
      undefined,
      origin,
      channelId,
    );
    if (origin !== undefined && this.status(channelId, opened.messageId) === 'pending') {
      try {
        await this.deps.notify!(owner.botSlug, origin, channelId, opened.messageId);
        this.deps.log('im-notice-settled', {
          botSlug: owner.botSlug,
          requestId: opened.messageId,
        });
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
    channelId = dmChannelId(owner.botSlug),
  ): Promise<{ messageId: string; result: Promise<PrivateInputResult> }> {
    const id = randomUUID();
    let resolve!: Pending['resolve'];
    const result = new Promise<PrivateInputResult>((done) => {
      resolve = done;
    });
    const pending: Pending = {
      agent,
      botSlug: owner.botSlug,
      channelId,
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
      pending.commit = this.deps.channels.appendMessageOnce(OWNER_HUMAN_CONTEXT, channelId, {
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
    if (pending !== undefined && channelId === pending.channelId && pending.committed) {
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
    const channelId = pending.channelId;
    let committed = false;
    try {
      const result = await this.deps.channels.appendMessageOnce(
        pending.decidingHuman ?? OWNER_HUMAN_CONTEXT,
        channelId,
        {
          id: 'private-resolution-' + id,
          at: new Date().toISOString(),
          author: { kind: 'human' },
          replyTo: id,
          body: state === 'cancelled' ? 'Private input cancelled' : 'Private input expired',
          privateInputResolution: {
            requestMessageId: id,
            state,
            references: {},
            ...(pending.decidingHuman
              ? {
                  decidedBy: this.deps.approvals?.decider(pending.decidingHuman) ?? {
                    humanId: pending.decidingHuman.humanId,
                  },
                }
              : {}),
          },
        },
      );
      committed =
        (result.status === 'appended' || result.status === 'existing') &&
        result.message.privateInputResolution?.state === state;
    } catch {
      committed = this.#resolution(channelId, id)?.state === state;
      if (!committed)
        this.deps.log('terminal-save-failed', {
          requestId: id,
          botSlug: pending.botSlug,
        });
    }
    this.#finish(id, pending, {
      status: committed ? state : 'expired',
      account: pending.request.account,
      references: {},
    });
    return committed;
  }

  async #stop(
    id: string,
    pending: Pending,
    state: Terminal,
    human?: HumanContext,
  ): Promise<boolean> {
    if (this.#pending.get(id) !== pending) return false;
    const resolution = this.#resolution(pending.channelId, id);
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
    if (human) pending.decidingHuman = human;
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
      return this.#resolution(pending.channelId, id)?.state === state;
    }
    pending.operation = this.#terminal(id, pending);
    try {
      return await pending.operation;
    } finally {
      pending.operation = undefined;
    }
  }

  async submit(owner: boolean, input: unknown): Promise<boolean> {
    return (await this.submission(owner, input)).accepted;
  }

  async submission(
    owner: boolean,
    input: unknown,
    human = OWNER_HUMAN_CONTEXT,
  ): Promise<PrivateSubmissionResult> {
    const refuse = (reason: PrivateSubmissionRefusal, botSlug?: string, requestId?: string) => {
      this.deps.log('submit-refused', {
        reason,
        ...(botSlug === undefined ? {} : { botSlug }),
        ...(requestId === undefined ? {} : { requestId }),
      });
      return { accepted: false, reason };
    };
    if (!owner) return refuse('not-owner');
    await this.recover();
    const parsed = privateSubmissionSchema.safeParse(input);
    if (!parsed.success) return refuse('invalid-fields');
    const { channelId, messageId, values } = parsed.data;
    this.deps.approvals?.requireRequest(human, channelId, messageId);
    const pending = this.#pending.get(messageId);
    if (pending === undefined || channelId !== pending.channelId)
      return refuse('not-pending', undefined, messageId);
    if (pending.operation !== undefined) return refuse('busy', pending.botSlug, messageId);
    if (this.status(channelId, messageId) !== 'pending')
      return refuse('not-pending', pending.botSlug, messageId);
    const fields = pending.request.fields;
    if (
      Object.keys(values).some((key) => !fields.some((field) => field.id === key)) ||
      fields.some((field) => field.required && (values[field.id]?.length ?? 0) === 0)
    )
      return refuse('invalid-fields', pending.botSlug, messageId);
    const credentials = this.deps.credentials();
    if (credentials === undefined) return refuse('store-unavailable', pending.botSlug, messageId);
    const operation = this.#accounts.serial(this.#scope(pending), () =>
      this.#submit(channelId, messageId, pending, credentials, values, human),
    );
    pending.operation = operation.then(
      (result) => result.accepted,
      () => false,
    );
    try {
      return await operation;
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
    human: HumanContext,
  ): Promise<PrivateSubmissionResult> {
    const grantId = randomUUID();
    let stage: PrivateSubmissionRefusal = 'expired';
    const key = credentialKey('botharness-private', 'grant-' + grantId);
    const references = Object.fromEntries(
      pending.request.fields
        .filter((field) => (values[field.id]?.length ?? 0) > 0)
        .map((field) => [field.id, privateReference(grantId, field.id)]),
    );
    let configured = false;
    let activated = false;
    let writeAttempted = false;
    let stopping: Promise<Omit<PrivateRevocationResult, 'accepted'>> | undefined;
    try {
      if (!(await this.deps.qualified()) || !this.#valid(pending))
        throw new Error('Private input expired');
      stage = 'store-unavailable';
      const binding = await this.#accounts.read(this.#scope(pending));
      stage = 'version-changed';
      if (binding?.revision !== pending.expectedRevision)
        throw new Error('Private account version changed');
      stage = 'save-failed';
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
      stage = 'expired';
      if (!this.#valid(pending)) throw new Error('Private input expired');
      stage = 'save-failed';
      await this.#accounts.commit(this.#scope(pending), pending.expectedRevision, grantId, () =>
        this.#valid(pending),
      );
      activated = true;
      stage = 'not-committed';
      stopping = stopUses(this.#accountOperations, this.#scope(pending), 'replacement');
      try {
        await this.deps.channels.appendMessageOnce(
          human,
          channelId,
          {
            id: 'private-resolution-' + id,
            at: new Date().toISOString(),
            author: { kind: 'human' },
            replyTo: id,
            body: 'Private information configured',
            privateInputResolution: {
              requestMessageId: id,
              state: 'configured',
              references,
              decidedBy: this.deps.approvals?.decider(human) ?? { humanId: human.humanId },
            },
          },
          undefined,
          undefined,
          () => {
            this.deps.approvals?.requireRequest(human, channelId, id);
            return this.#valid(pending);
          },
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
    } catch (error) {
      if (stage === 'save-failed' && !this.#valid(pending)) stage = 'expired';
      this.deps.log('submit-failed', {
        requestId: id,
        reason: stage,
        errorName: error instanceof Error ? error.name : typeof error,
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
    return configured ? { accepted: true } : { accepted: false, reason: stage };
  }

  async cancel(
    owner: boolean,
    channelId: string,
    messageId: string,
    human = OWNER_HUMAN_CONTEXT,
  ): Promise<boolean> {
    const pending = this.#pending.get(messageId);
    if (
      !owner ||
      pending === undefined ||
      channelId !== pending.channelId ||
      this.status(channelId, messageId) !== 'pending'
    )
      return false;
    this.deps.approvals?.requireRequest(human, channelId, messageId);
    return this.#stop(messageId, pending, 'cancelled', human);
  }

  consume<T>(
    agent: Agent,
    account: string,
    references: Record<string, string>,
    run: (values: Record<string, string>, signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
    sharedFrom?: string,
  ): Promise<T> {
    return consume(this.#accountOperations, agent, account, references, run, signal, sharedFrom);
  }

  accountStatus(
    owner: boolean,
    channelId: string,
    messageId: string,
  ): Promise<PrivateAccountStatus> {
    return accountStatus(this.#accountOperations, owner, channelId, messageId);
  }

  accounts(owner: boolean, botSlug: string): Promise<PrivateAccountSummary[] | undefined> {
    return accounts(this.#accountOperations, owner, botSlug);
  }

  async replaceable(): Promise<boolean> {
    return !this.#closed && this.deps.credentials() !== undefined && (await this.deps.qualified());
  }

  replace(owner: boolean, channelId: string, messageId: string): Promise<string | undefined> {
    return replace(this.#accountOperations, owner, channelId, messageId);
  }

  revoke(
    owner: boolean,
    channelId: string,
    messageId: string,
    human: HumanContext = OWNER_HUMAN_CONTEXT,
  ): Promise<PrivateRevocationResult> {
    return revoke(this.#accountOperations, owner, channelId, messageId, human);
  }

  eraseBot(botSlug: string): Promise<number> {
    return eraseBot(this.#accountOperations, botSlug);
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
