import { randomUUID } from 'node:crypto';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { credentialKey } from '@deepseek-ai/dsh-credentials';
import { z } from 'zod';

import type { ChannelMessage } from '../channels/channel.js';
import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
import type { PrivateAccountBindings, PrivateAccountScope } from './account-bindings.js';
import type {
  PrivateAccountStatus,
  PrivateAccountSummary,
  PrivateInputDeclaration,
  PrivateInputResult,
  PrivateRevocationResult,
} from './contracts.js';
import { PrivateInputFailure } from './diagnostics.js';
import { PrivateInputRefusal, type PrivateInputOrigin } from './im-origin.js';
import type { Pending, PrivateReplyScope, PrivateUse, Terminal } from './private-input-types.js';
import type { PrivateInputs } from './private-inputs.js';
import { PRIVATE_REFERENCE } from './references.js';

const grantFields = {
  botSlug: z.string(),
  botCreatedAt: z.string(),
  account: z.string(),
  values: z.record(z.string(), z.string()),
};
export const storedGrant = z.discriminatedUnion('version', [
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

export type AccountOperations = {
  readonly inputs: PrivateInputs;
  isClosed(): boolean;
  readonly accounts: PrivateAccountBindings;
  readonly pending: Map<string, Pending>;
  readonly origins: WeakMap<Agent, Map<string, Map<string, PrivateInputOrigin>>>;
  readonly uses: Set<PrivateUse>;
  readonly completed: Set<string>;
  readonly replyScopes: Set<PrivateReplyScope>;
  owner(agent: Agent): { botSlug: string; createdAt: string } | undefined;
  cardChannel(botSlug: string, channelId: string): boolean;
  resolution(channelId: string, messageId: string): ChannelMessage['privateInputResolution'];
  grantCommitted(grant: z.infer<typeof storedGrant>, id: string): boolean;
  guardReply(
    agent: Agent,
    scope: PrivateAccountScope,
    origin: PrivateInputOrigin,
    ready: () => boolean,
  ): void;
  valid(pending: Pending): boolean;
  open(
    agent: Agent | undefined,
    owner: { botSlug: string; createdAt: string },
    request: PrivateInputDeclaration,
    signal: AbortSignal,
    expectedRevision: string | undefined,
    replacesMessageId?: string,
    origin?: PrivateInputOrigin,
    channelId?: string,
  ): Promise<{ messageId: string; result: Promise<PrivateInputResult> }>;
  publish(botSlug: string): void;
  stop(id: string, pending: Pending, state: Terminal): Promise<boolean>;
};

export async function consume<T>(
  context: AccountOperations,
  agent: Agent,
  account: string,
  references: Record<string, string>,
  run: (values: Record<string, string>, signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
  sharedFrom?: string,
): Promise<T> {
  await context.inputs.recover();
  const grantOwner = () => {
    const caller = context.owner(agent);
    if (caller === undefined || sharedFrom === undefined) return caller;
    const bot = context.inputs.deps.registry.get(sharedFrom);
    return bot === undefined ? undefined : { botSlug: sharedFrom, createdAt: bot.createdAt };
  };
  const owner = grantOwner();
  if (owner === undefined)
    throw new PrivateInputFailure(
      sharedFrom === undefined
        ? 'Protected credential use needs the live main conversation Session of a PersonaBot; this Session is not one.'
        : 'The PersonaBot that shares this account is unavailable.',
      'no-owner',
    );
  if (!(await context.inputs.deps.qualified()))
    throw new PrivateInputFailure(
      'Protected credential use is unavailable in this Profile.',
      'unqualified',
    );
  const invalidReferences = () =>
    new PrivateInputFailure(
      'Credential references are invalid: pass 1 to 8 references from one ask_secret result, each private:<id>:<field> used for its own field.',
      'invalid-references',
    );
  const entries = Object.entries(references);
  if (entries.length === 0 || entries.length > 8) throw invalidReferences();
  const matches = entries.map(([field, ref]) => ({
    field,
    match: PRIVATE_REFERENCE.exec(ref),
  }));
  const id = matches[0]?.match?.[1];
  if (
    id === undefined ||
    matches.some(({ field, match }) => match?.[1] !== id || match?.[2] !== field)
  )
    throw invalidReferences();
  const scope = {
    botSlug: owner.botSlug,
    botCreatedAt: owner.createdAt,
    account,
  };
  const remembered = [...(context.origins.get(agent)?.get(account)?.values() ?? [])].filter(
    (origin) => origin.applies(),
  );
  if (remembered.length > 1) throw new PrivateInputRefusal('private-source-ambiguous');
  const origin =
    sharedFrom === undefined ? (remembered[0] ?? context.inputs.deps.origin?.(agent)) : undefined;
  if (origin !== undefined && !origin.current())
    throw new PrivateInputRefusal('private-source-revoked');
  const startedUse = await context.accounts
    .serial(scope, async () => {
      const record = await context.inputs.deps
        .credentials()
        ?.readRecord(credentialKey('botharness-private', 'grant-' + id));
      const grant = storedGrant.safeParse(record?.kind === 'grant' ? record.payload : undefined);
      if (
        !grant.success ||
        grant.data.botSlug !== owner.botSlug ||
        grant.data.botCreatedAt !== owner.createdAt ||
        grant.data.account !== account ||
        !context.grantCommitted(grant.data, id) ||
        matches.some(({ field }) => grant.data.values[field] === undefined)
      )
        throw new PrivateInputRefusal('private-account-unavailable');
      const binding = await context.accounts.read(scope);
      if (
        (binding !== undefined && binding.grantId !== id) ||
        (grant.data.version === 3 && binding?.grantId !== id)
      )
        throw new PrivateInputRefusal('private-account-unavailable');
      const currentOwner = grantOwner();
      if (currentOwner?.botSlug !== owner.botSlug || currentOwner.createdAt !== owner.createdAt)
        throw new PrivateInputFailure(
          'The PersonaBot that owns this account changed while the request was starting.',
          'authority-changed',
        );
      if (signal?.aborted)
        throw new PrivateInputFailure(
          'The protected request was cancelled before it started.',
          'cancelled',
        );
      if (origin !== undefined && !origin.current())
        throw new PrivateInputRefusal('private-source-revoked');
      if (origin !== undefined) context.guardReply(agent, scope, origin, () => true);
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
      context.uses.add(use);
      context.completed.delete(context.accounts.key(scope));
      const promise = Promise.resolve()
        .then(() => {
          if (origin !== undefined && !origin.current())
            throw new PrivateInputRefusal('private-source-revoked');
          if (controller.signal.aborted)
            throw controller.signal.reason instanceof PrivateInputRefusal
              ? controller.signal.reason
              : new Error('Protected credential consumer was cancelled');
          return run(resolved, controller.signal);
        })
        .then(
          (result) => {
            if (origin !== undefined && !origin.current()) {
              settle('completed');
              throw new PrivateInputRefusal('private-source-revoked');
            }
            settle('completed');
            return result;
          },
          (error: unknown) => {
            settle(controller.signal.aborted ? 'stopped' : 'completed');
            if (origin !== undefined && !origin.current())
              throw new PrivateInputRefusal('private-source-revoked');
            if (controller.signal.reason instanceof PrivateInputRefusal)
              throw controller.signal.reason;
            throw error;
          },
        )
        .finally(() => {
          for (const field of Object.keys(resolved)) delete resolved[field];
          signal?.removeEventListener('abort', abort);
          origin?.signal.removeEventListener('abort', abort);
          context.uses.delete(use);
          context.completed.add(context.accounts.key(scope));
          if (context.completed.size > 100)
            context.completed.delete(context.completed.values().next().value!);
        });
      return { promise };
    })
    .catch((error: unknown) => {
      if (error instanceof PrivateInputRefusal || error instanceof PrivateInputFailure) {
        context.inputs.deps.log('consume-refused', {
          requestId: id,
          botSlug: owner.botSlug,
          sessionId: agent.session.id,
          reason: error instanceof PrivateInputFailure ? error.reason : String(error.code),
        });
        throw error;
      }
      context.inputs.deps.log('consume-refused', {
        requestId: id,
        botSlug: owner.botSlug,
        sessionId: agent.session.id,
        reason: 'store-unreadable',
        errorName: error instanceof Error ? error.name : typeof error,
      });
      throw new PrivateInputFailure(
        'The Host could not read the saved private information for this account from its credential store. Report this to the Owner; asking for the secret again will not help until the store is readable.',
        'store-unreadable',
      );
    });
  const started = Date.now();
  const details = {
    requestId: id,
    botSlug: owner.botSlug,
    sessionId: agent.session.id,
  };
  context.inputs.deps.log('consume-started', details);
  try {
    const result = await startedUse.promise;
    context.inputs.deps.log('consume-completed', {
      ...details,
      durationMs: Date.now() - started,
    });
    return result;
  } catch (error) {
    const known = error instanceof PrivateInputRefusal || error instanceof PrivateInputFailure;
    context.inputs.deps.log('consume-failed', {
      ...details,
      durationMs: Date.now() - started,
      reason:
        error instanceof PrivateInputFailure
          ? error.reason
          : error instanceof PrivateInputRefusal
            ? String(error.code)
            : 'consumer-error',
      ...(known ? {} : { errorName: error instanceof Error ? error.name : typeof error }),
    });
    if (known) throw error;
    throw new PrivateInputFailure(
      `Protected credential consumer failed (${error instanceof Error ? error.name : typeof error}); the Host diagnostic log has the details.`,
      'consumer-error',
    );
  }
}

function configuredCard(context: AccountOperations, channelId: string, messageId: string) {
  const card = context.inputs.deps.channels.message(channelId, messageId);
  const request = card?.privateInputRequest;
  const resolution = context.resolution(channelId, messageId);
  const bot =
    card?.author.kind === 'bot' ? context.inputs.deps.registry.get(card.author.slug) : undefined;
  const references = resolution?.references;
  const grantId =
    references === undefined
      ? undefined
      : PRIVATE_REFERENCE.exec(Object.values(references)[0] ?? '')?.[1];
  if (
    context.isClosed() ||
    bot === undefined ||
    !context.cardChannel(bot.slug, channelId) ||
    request === undefined ||
    resolution?.state !== 'configured' ||
    grantId === undefined
  )
    return undefined;
  return {
    scope: {
      botSlug: bot.slug,
      botCreatedAt: bot.createdAt,
      account: request.account,
    },
    grantId,
    request,
    references: resolution.references,
  };
}

export async function accountStatus(
  context: AccountOperations,
  owner: boolean,
  channelId: string,
  messageId: string,
): Promise<PrivateAccountStatus> {
  if (!owner) return { status: 'unavailable', references: {} };
  const card = configuredCard(context, channelId, messageId);
  if (card === undefined) return { status: 'unavailable', references: {} };
  return context.accounts.serial(card.scope, async () => {
    const binding = await context.accounts.read(card.scope);
    if (binding?.grantId === null) return { status: 'revoked', references: {} };
    if (binding !== undefined && binding.grantId !== card.grantId)
      return { status: 'superseded', references: {} };
    const record = await context.inputs.deps
      .credentials()
      ?.readRecord(credentialKey('botharness-private', 'grant-' + card.grantId));
    const grant = storedGrant.safeParse(record?.kind === 'grant' ? record.payload : undefined);
    if (
      !grant.success ||
      grant.data.botSlug !== card.scope.botSlug ||
      grant.data.botCreatedAt !== card.scope.botCreatedAt ||
      grant.data.account !== card.scope.account ||
      !context.grantCommitted(grant.data, card.grantId) ||
      (grant.data.version === 3 && binding?.grantId !== card.grantId)
    )
      return { status: 'unavailable', references: {} };
    return { status: 'configured', references: card.references };
  });
}

export async function accounts(
  context: AccountOperations,
  owner: boolean,
  botSlug: string,
): Promise<PrivateAccountSummary[] | undefined> {
  if (!owner) return undefined;
  const bot = context.inputs.deps.registry.get(botSlug);
  if (bot === undefined || context.isClosed()) return [];
  try {
    await context.inputs.recover();
    const credentials = context.inputs.deps.credentials();
    if (credentials === undefined) return undefined;
    const bindings = await context.accounts.list(bot.slug, bot.createdAt);
    const rows: PrivateAccountSummary[] = [];
    for (const listed of bindings) {
      const scope = {
        botSlug: bot.slug,
        botCreatedAt: bot.createdAt,
        account: listed.account,
      };
      const row = await context.accounts.serial(scope, async () => {
        const binding = await context.accounts.read(scope);
        if (binding?.grantId === undefined || binding.grantId === null) return undefined;
        const grantId = binding.grantId;
        const record = await credentials.readRecord(
          credentialKey('botharness-private', 'grant-' + grantId),
        );
        const grant = storedGrant.safeParse(record?.kind === 'grant' ? record.payload : undefined);
        const card =
          grant.success && grant.data.version !== 1
            ? {
                channelId: grant.data.channelId,
                messageId: grant.data.requestMessageId,
                request: context.inputs.deps.channels.message(
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
          context.grantCommitted(grant.data, grantId);
        const replacement = [...context.pending.entries()].find(
          ([, pending]) =>
            pending.agent === undefined &&
            pending.committed &&
            pending.botSlug === scope.botSlug &&
            pending.botCreatedAt === scope.botCreatedAt &&
            pending.request.account === scope.account &&
            pending.expectedRevision === binding.revision &&
            context.valid(pending),
        );
        const request = verified ? card.request : undefined;
        const configuredAt = verified
          ? context.inputs.deps.channels.message(
              card.channelId,
              'private-resolution-' + card.messageId,
            )?.at
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
    context.inputs.deps.log('account-list-failed', { botSlug });
    return undefined;
  }
}

export async function replace(
  context: AccountOperations,
  owner: boolean,
  channelId: string,
  messageId: string,
): Promise<string | undefined> {
  if (!owner || !(await context.inputs.deps.qualified())) return undefined;
  await context.inputs.recover();
  const card = configuredCard(context, channelId, messageId);
  if (card === undefined) return undefined;
  return context.accounts.serial(card.scope, async () => {
    const binding = await context.accounts.read(card.scope);
    if (binding !== undefined && binding.grantId !== card.grantId) return undefined;
    const pending = [...context.pending.entries()].find(
      ([, request]) =>
        request.agent === undefined &&
        request.botSlug === card.scope.botSlug &&
        request.botCreatedAt === card.scope.botCreatedAt &&
        request.request.account === card.scope.account &&
        request.expectedRevision === binding?.revision &&
        context.valid(request),
    );
    if (pending !== undefined) return pending[0];
    const record = await context.inputs.deps
      .credentials()
      ?.readRecord(credentialKey('botharness-private', 'grant-' + card.grantId));
    const grant = storedGrant.safeParse(record?.kind === 'grant' ? record.payload : undefined);
    if (
      !grant.success ||
      grant.data.botCreatedAt !== card.scope.botCreatedAt ||
      grant.data.botSlug !== card.scope.botSlug ||
      grant.data.account !== card.scope.account ||
      !context.grantCommitted(grant.data, card.grantId) ||
      (grant.data.version === 3 && binding?.grantId !== card.grantId)
    )
      return undefined;
    const opened = await context.open(
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
      undefined,
      channelId,
    );
    return opened.messageId;
  });
}

export async function stopUses(
  context: AccountOperations,
  scope: PrivateAccountScope,
  initiator: 'replacement' | 'revocation',
): Promise<Omit<PrivateRevocationResult, 'accepted'>> {
  const started = Date.now();
  for (const reply of context.replyScopes)
    if (context.accounts.key(reply.scope) === context.accounts.key(scope) && reply.ready())
      reply.controller.abort();
  const uses = [...context.uses].filter(
    (use) => context.accounts.key(use.scope) === context.accounts.key(scope),
  );
  const summary = {
    stopped: 0,
    completed: uses.length === 0 && context.completed.has(context.accounts.key(scope)) ? 1 : 0,
    uncertain: 0,
  };
  for (const use of uses)
    use.controller.abort(new PrivateInputRefusal('private-account-unavailable'));
  context.inputs.deps.log('consumer-stop-requested', {
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
  context.inputs.deps.log('consumer-stop-settled', {
    botSlug: scope.botSlug,
    initiator,
    durationMs: Date.now() - started,
    ...summary,
  });
  return summary;
}

export async function revoke(
  context: AccountOperations,
  owner: boolean,
  channelId: string,
  messageId: string,
  human: HumanContext = OWNER_HUMAN_CONTEXT,
): Promise<PrivateRevocationResult> {
  const refused = { accepted: false, stopped: 0, completed: 0, uncertain: 0 };
  if (!owner) return refused;
  await context.inputs.recover();
  const card = configuredCard(context, channelId, messageId);
  if (card === undefined) return refused;
  const accepted = await context.accounts.serial(card.scope, async () => {
    const binding = await context.accounts.read(card.scope);
    if (binding !== undefined && binding.grantId !== card.grantId) return undefined;
    const record = await context.inputs.deps
      .credentials()
      ?.readRecord(credentialKey('botharness-private', 'grant-' + card.grantId));
    const grant = storedGrant.safeParse(record?.kind === 'grant' ? record.payload : undefined);
    if (
      !grant.success ||
      grant.data.botCreatedAt !== card.scope.botCreatedAt ||
      grant.data.botSlug !== card.scope.botSlug ||
      grant.data.account !== card.scope.account ||
      !context.grantCommitted(grant.data, card.grantId) ||
      (grant.data.version === 3 && binding?.grantId !== card.grantId)
    )
      return undefined;
    await context.accounts.commit(
      card.scope,
      binding?.revision,
      null,
      () =>
        configuredCard(context, channelId, messageId)?.scope.botCreatedAt ===
        card.scope.botCreatedAt,
    );
    context.publish(card.scope.botSlug);
    context.inputs.deps.log('account-revoked', {
      botSlug: card.scope.botSlug,
      requestId: card.grantId,
    });
    await context.inputs.deps
      .credentials()
      ?.deleteRecord(credentialKey('botharness-private', 'grant-' + card.grantId))
      .catch(() => context.inputs.deps.log('cleanup-failed', { requestId: card.grantId }));
    return { stopping: stopUses(context, card.scope, 'revocation') };
  });
  if (!accepted) return refused;
  const summary = await accepted.stopping;
  await context.inputs.deps.channels
    .appendMessageOnce(human, channelId, {
      id: 'private-revocation-' + randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'human' },
      replyTo: messageId,
      body: `Private account access revoked locally. Stopped: ${summary.stopped}; already completed: ${summary.completed}; uncertain: ${summary.uncertain}. Remote token validity and completed effects are unchanged.`,
    })
    .catch(() =>
      context.inputs.deps.log('revocation-report-failed', {
        botSlug: card.scope.botSlug,
        requestId: card.grantId,
      }),
    );
  return { accepted: true, ...summary };
}

export async function eraseBot(context: AccountOperations, botSlug: string): Promise<number> {
  const bot = context.inputs.deps.registry.getHistorical(botSlug);
  const credentials = context.inputs.deps.credentials();
  if (bot === undefined || credentials === undefined) return 0;
  await context.inputs.recover();
  for (const [id, pending] of context.pending)
    if (pending.botSlug === bot.slug && pending.botCreatedAt === bot.createdAt)
      await context.stop(id, pending, 'cancelled');
  let erased = 0;
  for (const listed of await context.accounts.list(bot.slug, bot.createdAt)) {
    const scope = {
      botSlug: bot.slug,
      botCreatedAt: bot.createdAt,
      account: listed.account,
    };
    await context.accounts.serial(scope, async () => {
      const binding = await context.accounts.read(scope);
      if (binding === undefined) return;
      await stopUses(context, scope, 'revocation');
      if (binding.grantId !== null) {
        await credentials.deleteRecord(
          credentialKey('botharness-private', 'grant-' + binding.grantId),
        );
        erased += 1;
      }
      await credentials.deleteRecord(context.accounts.key(scope));
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
  context.inputs.deps.log('bot-accounts-erased', {
    botSlug: bot.slug,
    completed: erased,
  });
  return erased;
}
