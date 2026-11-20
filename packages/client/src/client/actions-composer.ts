import { retryChannelMessage } from '@botharness/host-client/channel-messages';
import { subscribeSkillCatalog } from './messaging-defaults-live.js';
import type * as prompts from '@botharness/host-client/prompt-presets';
import { onboardingFor } from './onboarding.js';
import {
  loadAllBotPreview,
  loadBotSkills,
  loadChannelSkillCatalog,
  loadSessionSkillCatalog,
  loadSkillDetail,
  removeBotSkill,
  type BotSkillRow,
  type SkillDetailView,
  validateComposerDraft,
  BridgeCallError,
  errorMessage,
  loadTimelinePage,
  sendChannelMessage,
  type BridgeCall,
} from './bridge.js';
import {
  initialTimeline,
  quoteRefOf,
  type ChannelAttachmentRef,
  type ChannelMessage,
  type ClientStore,
} from './store.js';
import {
  ComposerSubmissionStore,
  type SubmissionAttempt,
  type SubmissionSnapshot,
} from './composer-submission-store.js';
import type { ActionFolderAccess, BridgeActions, ReplyPreviewOf } from './actions.js';
import type { createSessionActions } from './actions-sessions.js';

export interface ComposerActions {
  validateComposerDraft(
    channelId: string,
    attachments: ChannelAttachmentRef[],
    replyTo?: string,
    quotes?: ReadonlyArray<{ messageId: string; text?: string }>,
  ): Promise<{
    reply?: ChannelMessage;
    attachments: Array<ChannelAttachmentRef | null>;
    quotes?: Array<ChannelMessage | null>;
  }>;
  retryMessage(
    channelId: string,
    messageId: string,
    recovery?: {
      action: 'continue' | 'compact' | 'new-session';
      failureMessageId: string;
    },
  ): Promise<void>;
  dismissFailedMessage(channelId: string, messageId: string): boolean;
  botSkills?(slug: string): Promise<BotSkillRow[]>;
  skillDetail?(name: string, owner: string): Promise<SkillDetailView>;
  botSkillRemove?(slug: string, name: string): Promise<void>;
  subscribeSkillCatalog?(channelId: string, listener: () => void): () => void;
  submissions: {
    subscribe(listener: () => void): () => void;
    snapshot(channelId: string): SubmissionSnapshot | undefined;
    begin(
      channelId: string,
      attempt: Pick<SubmissionAttempt, 'text' | 'mentions' | 'channelRefs'> &
        Partial<Pick<SubmissionAttempt, 'replyTo' | 'quotes' | 'attachments'>>,
    ): { id: string; persisted: boolean } | undefined;
    cancel(channelId: string, id: string): void;
    sync(channelId: string): void;
    check(channelId: string, id: string): Promise<'committed' | 'absent' | 'unknown'>;
    reconcile(channelId: string): Promise<void>;
  };
}

let localEchoSequence = 0;

function nextLocalEchoId(): string {
  localEchoSequence += 1;
  const fallback = `${localEchoSequence.toString(16).padStart(8, '0').slice(-8)}-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
  const unique = globalThis.crypto?.randomUUID?.() ?? fallback;
  return `human-${unique}`;
}

function reconcileCommittedMessage(
  messages: readonly ChannelMessage[],
  localId: string,
  committed: ChannelMessage,
): ChannelMessage[] {
  if (committed.id !== localId && messages.some((message) => message.id === committed.id)) {
    return messages.filter((message) => message.id !== localId);
  }
  const index = messages.findIndex((message) => message.id === localId);
  if (index < 0) return [...messages, committed];
  return messages.map((message) => (message.id === localId ? committed : message));
}

export function createComposerActions(
  call: BridgeCall,
  clientStore: ClientStore,
  folderAccess: ActionFolderAccess | undefined,
  host: prompts.PromptPresetClient,
  getActions: () => BridgeActions,
  replyPreviewOf: ReplyPreviewOf,
  currentSelection: ReturnType<typeof createSessionActions>['currentSelection'],
  selectedBotSlug: ReturnType<typeof createSessionActions>['selectedBotSlug'],
  loadSessionsFor: ReturnType<typeof createSessionActions>['loadSessionsFor'],
) {
  const submissions =
    folderAccess?.submissions ??
    new ComposerSubmissionStore(
      (() => {
        try {
          return typeof localStorage === 'undefined' ? undefined : localStorage;
        } catch {
          return undefined;
        }
      })(),
    );
  const submissionScope = (channelId: string): string | undefined => {
    const identity = clientStore.getSnapshot().composerIdentity;
    return identity === undefined
      ? undefined
      : JSON.stringify([identity.hostId, identity.profileId, identity.humanId, channelId]);
  };
  const currentHumanAuthor = (): ChannelMessage['author'] => {
    const identity = clientStore.getSnapshot().composerIdentity;
    return identity === undefined
      ? { kind: 'human' }
      : { kind: 'human', humanId: identity.humanId };
  };
  const submissionEcho = (
    attempt: SubmissionAttempt,
    known: readonly ChannelMessage[] = [],
  ): ChannelMessage => ({
    id: attempt.id,
    at: attempt.at,
    author: currentHumanAuthor(),
    body: attempt.text,
    ...(attempt.mentions.length === 0 ? {} : { mentions: attempt.mentions }),
    ...(attempt.channelRefs.length === 0 ? {} : { channelRefs: attempt.channelRefs }),
    ...(attempt.attachments === undefined ? {} : { attachments: attempt.attachments }),
    ...(attempt.replyTo === undefined ? {} : { replyTo: attempt.replyTo, replyToPreview: null }),
    ...(attempt.quotes === undefined || attempt.quotes.length === 0
      ? {}
      : {
          quotes: attempt.quotes.map((quote) => {
            const target =
              known.find((item) => item.id === quote.messageId) ??
              clientStore
                .getSnapshot()
                .conversation.messages.find((item) => item.id === quote.messageId);
            return {
              ...quote,
              preview: target === undefined ? null : replyPreviewOf(target),
            };
          }),
        }),
    pending: false,
    failed: attempt.error ?? '',
    ...(attempt.state === 'unknown' ? { unconfirmed: true } : {}),
  });
  const settleSubmission = (
    channelId: string,
    id: string,
    state: SubmissionAttempt['state'],
    error?: string,
  ): void => {
    const scope = submissionScope(channelId);
    if (scope !== undefined) submissions.settle(scope, id, state, error);
  };
  const failedByChannel = new Map<string, ChannelMessage[]>();
  const localFailedFor = (id: string, known: readonly ChannelMessage[] = []): ChannelMessage[] => {
    const held = failedByChannel.get(id) ?? [];
    const scope = submissionScope(id);
    if (scope === undefined) return held;
    const heldIds = new Set(held.map((message) => message.id));
    const active = new Set(
      clientStore
        .getSnapshot()
        .conversation.messages.filter((message) => message.pending === true)
        .map((message) => message.id),
    );
    return [
      ...held,
      ...submissions
        .read(scope)
        .attempts.filter(
          (attempt) =>
            (attempt.state === 'failed' || attempt.state === 'unknown') &&
            !heldIds.has(attempt.id) &&
            !active.has(attempt.id),
        )
        .map((attempt) => submissionEcho(attempt, known)),
    ];
  };
  const remainingFailures = (
    channelId: string,
    committed: readonly ChannelMessage[],
  ): ChannelMessage[] => {
    const committedIds = new Set(committed.map((message) => message.id));
    const current = localFailedFor(channelId, committed);
    const next = current.filter((message) => !committedIds.has(message.id));
    if (next.length !== current.length) {
      for (const message of current)
        if (committedIds.has(message.id)) settleSubmission(channelId, message.id, 'sent');
      failedByChannel.set(
        channelId,
        (failedByChannel.get(channelId) ?? []).filter((message) => !committedIds.has(message.id)),
      );
    }
    return next;
  };
  const checkSubmission = async (
    channelId: string,
    id: string,
  ): Promise<'committed' | 'absent' | 'unknown'> => {
    try {
      const { page } = await loadTimelinePage(call, channelId, {
        direction: 'around',
        around: id,
        olderLimit: 0,
        newerLimit: 0,
      });
      return page.entries.some((message) => message.id === id) ? 'committed' : 'absent';
    } catch (error) {
      return error instanceof BridgeCallError && error.code === 'invalid-input'
        ? 'absent'
        : 'unknown';
    }
  };

  const actions = {
    async retryMessage(channelId, messageId, recovery) {
      await retryChannelMessage(host, { channelId, messageId, recovery });
      await getActions().refreshChannelMessages(channelId);
    },
    allBotPreview: (channelId) => loadAllBotPreview(call, channelId),
    subscribeSkillCatalog,
    skillCatalog: (channelId) => loadChannelSkillCatalog(call, channelId),
    sessionSkillCatalog: (slug, sessionId) => loadSessionSkillCatalog(call, slug, sessionId),
    botSkills: (slug) => loadBotSkills(call, slug),
    skillDetail: (name, owner) => loadSkillDetail(call, name, owner),
    botSkillRemove: (slug, name) => removeBotSkill(call, slug, name),
    validateComposerDraft: (channelId, attachments, replyTo, quotes) =>
      validateComposerDraft(call, channelId, attachments, replyTo, quotes),
    async send(
      body,
      replyTo,
      attachments,
      memorySwitchTarget,
      mentions,
      channelRefs,
      grantRequestResolution,
      allBotMention,
      submissionId,
      skillInvocations,
      quotes,
    ) {
      let snapshot = clientStore.getSnapshot();
      const channel = snapshot.conversation.channel;
      const text = body.trim();
      if (
        channel === undefined ||
        (text.length === 0 && !attachments?.length) ||
        snapshot.conversation.sending
      )
        return false;
      if (
        channel.type === 'dm' &&
        channel.botSlug !== undefined &&
        !attachments?.length &&
        !replyTo &&
        !quotes?.length &&
        !mentions?.length &&
        !channelRefs?.length &&
        !skillInvocations?.length &&
        !memorySwitchTarget &&
        !grantRequestResolution
      ) {
        const prepared = onboardingFor(getActions()).prepareSend(channel.id, channel.botSlug, text);
        if (!(typeof prepared === 'boolean' ? prepared : await prepared)) return false;
      }
      const replyTarget = snapshot.conversation.messages.find((message) => message.id === replyTo);
      const quoteEcho = quotes?.map((quote) => {
        const target = snapshot.conversation.messages.find(
          (message) => message.id === quote.messageId,
        );
        return {
          ...quoteRefOf(quote),
          preview: target === undefined ? null : replyPreviewOf(target),
        };
      });
      if (snapshot.conversation.timeline.hasNewer) {
        try {
          const { page, revision } = await loadTimelinePage(call, channel.id);
          if (clientStore.getSnapshot().conversation.channel?.id !== channel.id) return false;
          clientStore.setConversation({
            messages: [...page.entries, ...remainingFailures(channel.id, page.entries)],
            revision,
            timeline: { ...initialTimeline(), ...page },
            focusMessageId: undefined,
          });
          snapshot = clientStore.getSnapshot();
        } catch (error) {
          if (clientStore.getSnapshot().conversation.channel?.id === channel.id) {
            clientStore.setConversation({ error: errorMessage(error) });
          }
          return false;
        }
      }
      snapshot = clientStore.getSnapshot();
      if (snapshot.conversation.channel?.id !== channel.id || snapshot.conversation.sending)
        return false;
      const localId = submissionId ?? nextLocalEchoId();
      const scope = submissionScope(channel.id);
      if (
        scope !== undefined &&
        !submissions.read(scope).attempts.some((attempt) => attempt.id === localId)
      )
        submissions.record(scope, {
          id: localId,
          at: new Date().toISOString(),
          text,
          mentions: mentions ?? [],
          channelRefs: channelRefs ?? [],
          ...(replyTo === undefined ? {} : { replyTo }),
          ...(quotes === undefined || quotes.length === 0
            ? {}
            : {
                quotes: quotes.map(quoteRefOf),
              }),
          ...(attachments === undefined || attachments.length === 0 ? {} : { attachments }),
        });
      onboardingFor(getActions()).markSubmitted(channel.id, text);
      clientStore.setConversation({
        sending: true,
        error: undefined,
        messages: [
          ...snapshot.conversation.messages,
          {
            id: localId,
            at: new Date().toISOString(),
            author: currentHumanAuthor(),
            body: text,
            ...(attachments === undefined ? {} : { attachments }),
            ...(mentions === undefined ? {} : { mentions }),
            ...(channelRefs === undefined ? {} : { channelRefs }),
            ...(grantRequestResolution === undefined ? {} : { grantRequestResolution }),
            ...(replyTo === undefined
              ? {}
              : {
                  replyTo,
                  replyToPreview: replyTarget === undefined ? null : replyPreviewOf(replyTarget),
                }),
            ...(quoteEcho === undefined || quoteEcho.length === 0 ? {} : { quotes: quoteEcho }),
            pending: true,
          },
        ],
      });
      const localEcho = clientStore
        .getSnapshot()
        .conversation.messages.find((message) => message.id === localId)!;
      try {
        const message = await sendChannelMessage(
          call,
          channel.id,
          text,
          replyTo,
          attachments,
          localId,
          undefined,
          memorySwitchTarget,
          mentions,
          channelRefs,
          grantRequestResolution,
          undefined,
          allBotMention,
          undefined,
          skillInvocations,
          quotes,
        );
        remainingFailures(channel.id, [message]);
        settleSubmission(channel.id, localId, 'sent');
        const selection = currentSelection();
        const latest = clientStore.getSnapshot();
        if (latest.conversation.channel?.id === channel.id) {
          const visibleChannel = latest.conversation.channel;
          if (
            visibleChannel.latestMessage === undefined ||
            visibleChannel.latestMessage.at <= message.at
          ) {
            clientStore.upsertChannel({
              ...visibleChannel,
              updatedAt: message.at,
              latestMessage: message,
            });
          }
          clientStore.setConversation({
            sending: false,
            messages: reconcileCommittedMessage(latest.conversation.messages, localId, message),
          });
        } else {
          clientStore.updateCachedConversation(channel.id, (cached) => ({
            ...cached,
            messages: reconcileCommittedMessage(cached.messages, localId, message),
          }));
        }
        const slug = selectedBotSlug(selection);
        if (selection !== undefined && slug !== undefined) {
          void loadSessionsFor(slug, selection);
        }
        return true;
      } catch (error) {
        const latest = clientStore.getSnapshot();
        const matching =
          latest.conversation.channel?.id === channel.id
            ? latest.conversation.messages.find((message) => message.id === localId)
            : undefined;
        if (matching !== undefined && matching.pending !== true && matching.failed === undefined) {
          remainingFailures(channel.id, [matching]);
          settleSubmission(channel.id, localId, 'sent');
          clientStore.setConversation({ sending: false, error: undefined });
          return true;
        }
        if (
          allBotMention !== undefined ||
          (error instanceof BridgeCallError &&
            error.code === 'invalid-input' &&
            error.message.includes('Mentioned PersonaBot'))
        ) {
          if (latest.conversation.channel?.id === channel.id) {
            clientStore.setConversation({
              sending: false,
              error: errorMessage(error),
              messages: latest.conversation.messages.filter((message) => message.id !== localId),
            });
          } else {
            clientStore.updateCachedConversation(channel.id, (cached) => ({
              ...cached,
              messages: cached.messages.filter((message) => message.id !== localId),
            }));
          }
          if (scope !== undefined) submissions.discard(scope, localId);
          if (error instanceof BridgeCallError && error.code === 'all-bot-preview-changed')
            throw error;
          return false;
        }
        const unconfirmed = !(error instanceof BridgeCallError);
        settleSubmission(
          channel.id,
          localId,
          unconfirmed ? 'unknown' : 'failed',
          errorMessage(error),
        );
        const failedEcho: ChannelMessage = {
          ...localEcho,
          pending: false,
          failed: errorMessage(error),
          ...(unconfirmed ? { unconfirmed: true } : {}),
        };
        failedByChannel.set(channel.id, [
          ...(failedByChannel.get(channel.id) ?? []).filter((message) => message.id !== localId),
          failedEcho,
        ]);
        if (latest.conversation.channel?.id === channel.id) {
          clientStore.setConversation({
            sending: false,
            error: errorMessage(error),
            messages: latest.conversation.messages.some((message) => message.id === localId)
              ? latest.conversation.messages.map((message) =>
                  message.id === localId ? failedEcho : message,
                )
              : [...latest.conversation.messages, failedEcho],
          });
        } else {
          clientStore.updateCachedConversation(channel.id, (cached) => ({
            ...cached,
            messages: cached.messages.some((message) => message.id === localId)
              ? cached.messages.map((message) => (message.id === localId ? failedEcho : message))
              : [...cached.messages, failedEcho],
          }));
        }
        return false;
      }
    },
    submissions: {
      subscribe: submissions.subscribe,
      snapshot(channelId) {
        const scope = submissionScope(channelId);
        return scope === undefined ? undefined : submissions.read(scope);
      },
      begin(channelId, attempt) {
        const scope = submissionScope(channelId);
        if (scope === undefined) return undefined;
        const id = nextLocalEchoId();
        const persisted = submissions.record(scope, {
          ...attempt,
          id,
          at: new Date().toISOString(),
        });
        return { id, persisted };
      },
      cancel(channelId, id) {
        const scope = submissionScope(channelId);
        if (scope !== undefined) submissions.discard(scope, id);
      },
      sync(channelId) {
        const scope = submissionScope(channelId);
        if (scope === undefined) return;
        submissions.sync(scope);
        const states = new Map(
          submissions.read(scope).attempts.map((attempt) => [attempt.id, attempt.state]),
        );
        const settledElsewhere = (id: string): boolean =>
          states.get(id) === 'sent' || states.get(id) === 'restored';
        failedByChannel.set(
          channelId,
          (failedByChannel.get(channelId) ?? []).filter((item) => !settledElsewhere(item.id)),
        );
        const conversation = clientStore.getSnapshot().conversation;
        if (conversation.channel?.id !== channelId || conversation.timeline.hasNewer) return;
        const failures = localFailedFor(channelId);
        const failureIds = new Set(failures.map((item) => item.id));
        let changed = false;
        const kept = conversation.messages.flatMap((message) => {
          if (message.failed === undefined || !states.has(message.id)) return [message];
          if (!failureIds.has(message.id)) {
            changed = true;
            return [];
          }
          const unconfirmed = states.get(message.id) === 'unknown';
          if ((message.unconfirmed === true) === unconfirmed) return [message];
          changed = true;
          const { unconfirmed: _stale, ...rest } = message;
          return [unconfirmed ? { ...rest, unconfirmed: true } : rest];
        });
        const shown = new Set(kept.map((message) => message.id));
        const added = failures.filter((item) => !shown.has(item.id));
        if (!changed && added.length === 0) return;
        clientStore.setConversation({ messages: [...kept, ...added] });
      },
      check: checkSubmission,
      async reconcile(channelId) {
        const scope = submissionScope(channelId);
        if (scope === undefined) return;
        let committed = false;
        let changed = false;
        for (const attempt of submissions.reconcilable(scope)) {
          const status = await checkSubmission(channelId, attempt.id);
          if (status === 'unknown') continue;
          if (!submissions.reconcilable(scope).some((current) => current.id === attempt.id))
            continue;
          changed = true;
          committed ||= status === 'committed';
          submissions.settle(
            scope,
            attempt.id,
            status === 'committed' ? 'sent' : 'failed',
            status === 'committed' ? undefined : attempt.error,
          );
          failedByChannel.set(
            channelId,
            (failedByChannel.get(channelId) ?? []).filter((item) => item.id !== attempt.id),
          );
        }
        const conversation = clientStore.getSnapshot().conversation;
        if (!changed || conversation.channel?.id !== channelId) return;
        const failures = new Map(localFailedFor(channelId).map((item) => [item.id, item]));
        clientStore.setConversation({
          messages: conversation.messages.flatMap((message) =>
            message.failed === undefined
              ? [message]
              : failures.has(message.id)
                ? [failures.get(message.id)!]
                : [],
          ),
        });
        if (committed) await getActions().refreshChannelMessages(channelId);
      },
    },
    dismissFailedMessage(channelId, messageId) {
      const conversation = clientStore.getSnapshot().conversation;
      if (conversation.channel?.id !== channelId) return false;
      const failed = conversation.messages.find(
        (message) => message.id === messageId && message.failed !== undefined,
      );
      if (failed === undefined) return false;
      failedByChannel.set(
        channelId,
        (failedByChannel.get(channelId) ?? []).filter((item) => item.id !== messageId),
      );
      settleSubmission(channelId, messageId, 'restored');
      clientStore.setConversation({
        messages: conversation.messages.filter((message) => message.id !== messageId),
        error: undefined,
      });
      return true;
    },
  } satisfies ComposerActions &
    Pick<BridgeActions, 'allBotPreview' | 'send' | 'skillCatalog' | 'sessionSkillCatalog'>;
  return { actions, remainingFailures };
}
