import { readFileSync, writeFileSync, openSync, closeSync, fsyncSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const name = 'botharness-lark-provider-contract-e2e';
export const inject = ['dshIm'];

function save(path, value) {
  const temporary = `${path}.pending`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  const file = openSync(temporary, 'r+');
  try {
    fsyncSync(file);
  } finally {
    closeSync(file);
  }
  renameSync(temporary, path);
  if (process.platform === 'win32') return;
  const directory = openSync(dirname(path), 'r');
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
}

export function apply(ctx, { testConfigPath } = {}) {
  if (!testConfigPath) throw new Error('A task-owned testConfigPath is required');
  const config = () => JSON.parse(readFileSync(testConfigPath, 'utf8'));
  const settings = config();
  let state;
  try {
    state = JSON.parse(readFileSync(settings.reportPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = {
      version: 1,
      sources: [],
      checks: {},
      errors: [],
      layer: 'public dshIm provider contract; not PersonaBot integration',
    };
  }
  if (settings.reportPath === settings.publicReportPath)
    throw new Error('Private and public reports must be distinct');
  for (const source of state.sources) {
    if (source.outcome === 'attempt-started') source.outcome = 'unknown-or-refused';
  }
  state.runId = randomUUID();
  state.checks.authenticatedAccount = false;
  state.checks.publicExclusiveConsumer = false;
  state.checks.consumerDisposed = false;
  let active = true;
  let acquiring = false;
  let lease;
  let fingerprint;
  const cancel = new AbortController();
  const timers = new Set();
  const persist = () => {
    state.verifiedAt = new Date().toISOString();
    save(settings.reportPath, state);
    save(settings.publicReportPath, {
      version: 1,
      layer: state.layer,
      runtime: {
        runId: state.runId,
        probeSha256: createHash('sha256')
          .update(readFileSync(new URL(import.meta.url)))
          .digest('hex'),
        node: process.version,
      },
      verifiedAt: state.verifiedAt,
      profile: {
        dsh: '0.2.0-rc.1',
        providerSource: '19d88f14bf85d74d4abf035a0c749d0b4a640257',
        sdk: '1.73.0',
      },
      checks: state.checks,
      errors: state.errors,
      sources: state.sources.map((source, index) => ({
        source: index + 1,
        acceptedInCurrentRun: source.acceptedRun === state.runId,
        marker: source.marker,
        group: source.conversation.kind,
        exactAuthorizedGroup: source.conversation.id === settings.groupId,
        exactAuthorizedActor: source.actor.id === settings.allowedActorId,
        authenticatedMention: source.mentionedAccount === true,
        threadPresent: Boolean(source.reply.threadId),
        rootPresent: Boolean(source.reply.rootId),
        parentPresent: Boolean(source.reply.parentId),
        deliveryCount: source.deliveryCount,
        committedBeforeAcceptance: source.committedBeforeAcceptance,
        outcome: source.outcome,
        providerReceipt: Boolean(source.providerMessageId),
      })),
      limitations: [
        'No PersonaBot Inbox/Orchestrator or Outbox integration is claimed.',
        'Provider receipt means accepted, not delivered/read.',
        'No durable replay cursor, cross-brand permissions or multi-Bot support is claimed.',
      ],
    });
  };
  const fault = (phase, error) => {
    state.errors.push({ phase, code: error?.code ?? 'provider-error' });
    state.errors = state.errors.slice(-20);
    persist();
  };
  const reply = async (source) => {
    if (!active || cancel.signal.aborted || source.outcome !== 'not-attempted') return;
    source.outcome = 'attempt-started';
    persist();
    const options = { expectedFingerprint: fingerprint, signal: cancel.signal };
    try {
      try {
        await ctx.dshIm.replyChecked(
          settings.providerBotId,
          { ...source.reply, conversationId: 'unauthorized-group' },
          'SHOULD NOT SEND',
          options,
        );
        throw Object.assign(new Error('stale-group-was-accepted'), { code: 'qa-failed' });
      } catch (error) {
        if (error?.code !== 'stale-route') throw error;
        state.checks.staleGroupRefused = true;
      }
      if (source.reply.threadId) {
        try {
          await ctx.dshIm.replyChecked(
            settings.providerBotId,
            { ...source.reply, threadId: 'unauthorized-topic' },
            'SHOULD NOT SEND',
            options,
          );
          throw Object.assign(new Error('stale-topic-was-accepted'), { code: 'qa-failed' });
        } catch (error) {
          if (error?.code !== 'stale-route') throw error;
          state.checks.staleTopicRefused = true;
        }
      }
      const result = await ctx.dshIm.replyChecked(
        settings.providerBotId,
        source.reply,
        `${source.marker} ACK — public provider checked reply; PersonaBot integration is pending.`,
        options,
      );
      if (result?.sent !== true || !result.messageId)
        throw Object.assign(new Error('No receipt'), { code: 'reply-result-unknown' });
      source.outcome = 'provider-accepted';
      source.providerMessageId = result.messageId;
      state.checks[source.reply.threadId ? 'existingTopicCheckedReply' : 'groupRootCheckedReply'] =
        true;
      persist();
    } catch (error) {
      source.outcome = 'unknown-or-refused';
      fault('checked-reply', error);
    }
  };
  const accept = async (evidence, { signal } = {}) => {
    signal?.throwIfAborted();
    const marker = evidence.text.includes('[BH78 TOPIC]')
      ? '[BH78 TOPIC]'
      : evidence.text.includes('[BH78 ROOT]')
        ? '[BH78 ROOT]'
        : undefined;
    if (!marker) return { accepted: true, ignored: true };
    if (
      evidence.fingerprint !== fingerprint ||
      evidence.conversation.kind !== 'group' ||
      evidence.conversation.id !== settings.groupId ||
      evidence.actor.kind !== 'user' ||
      evidence.actor.id !== settings.allowedActorId ||
      evidence.mentionedAccount !== true
    )
      throw Object.assign(new Error('Outside the authorized test source'), {
        code: 'qa-scope-mismatch',
      });
    let source = state.sources.find((value) => value.messageId === evidence.messageId);
    if (source) {
      source.deliveryCount++;
      persist();
      return { accepted: true };
    }
    source = {
      ...structuredClone(evidence),
      marker,
      deliveryCount: 1,
      acceptedRun: state.runId,
      committedBeforeAcceptance: true,
      outcome: 'not-attempted',
    };
    state.sources.push(source);
    persist();
    signal?.throwIfAborted();
    const timer = setTimeout(() => {
      timers.delete(timer);
      void reply(source);
    }, 0);
    timers.add(timer);
    return { accepted: true };
  };
  const acquire = async () => {
    if (!active || acquiring || lease) return;
    acquiring = true;
    try {
      Object.assign(settings, config());
      if (!settings.providerBotId) return;
      const account = await ctx.dshIm.describeBot(settings.providerBotId);
      if (!active || !account.connected) return;
      if (
        ctx.dshIm.inboundVersion !== 1 ||
        !account.capabilities.includes('exclusive-text-consumer')
      )
        throw Object.assign(new Error('Public consumer contract unavailable'), {
          code: 'capability-unavailable',
        });
      fingerprint = account.account.fingerprint;
      state.checks.authenticatedAccount = /^[a-f0-9]{64}$/.test(fingerprint);
      const acquired = await ctx.dshIm.consumeInbound(settings.providerBotId, {
        expectedFingerprint: fingerprint,
        onEvent: accept,
        signal: cancel.signal,
      });
      if (!active) {
        acquired?.();
        return;
      }
      lease = acquired;
      state.checks.publicExclusiveConsumer = true;
      persist();
    } catch (error) {
      fault('acquire', error);
    } finally {
      acquiring = false;
    }
  };
  persist();
  ctx.effect(() => {
    const timer = setInterval(() => void acquire(), 1000);
    void acquire();
    return () => {
      active = false;
      clearInterval(timer);
      timers.forEach(clearTimeout);
      cancel.abort();
      lease?.();
      state.checks.consumerDisposed = true;
      persist();
    };
  });
}
