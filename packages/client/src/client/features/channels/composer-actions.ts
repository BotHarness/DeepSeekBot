import { MAX_DRAFT_QUOTES, type ComposerQuote } from '../../composer-draft-store.js';
import {
  quoteRefOf,
  type ConversationStateView,
  type BotSummary,
  type ChannelMessage,
  type ChannelSummary,
  type ClientStore,
} from '../../store.js';
import { launchSendFlight, sendFollowsLatest, type SendFlight } from '../../send-fly.js';
import { parseAllBotPreview } from '@botharness/host-client/channel-management';
import { BridgeCallError, uploadChannelAttachment, parseChannelAttachment } from '../../bridge.js';
import type { BridgeActions } from '../../actions.js';
import type { MessageHost } from '../../message-host.js';
import type { ChannelComposerUpload } from '../../channel-composer.js';
import {
  type SelectedMention,
  appendMention,
  quoteMention,
  rebaseMentions,
} from '../../mentions.js';
import { insertAttachmentReferences } from '../../attachment-refs.js';
import { liveSkills } from '../../skill-refs.js';
import { rebaseChannelRefs } from '../../channel-refs.js';
import type { BotHarnessTranslate } from '../../locale.js';
import { authorLabel, quoteSource } from './message-labels.js';
import type { ComposerEdits, ComposerTextDraft } from './composer-draft.js';

export function createComposerMessageActions({
  draftState: {
    recovery,
    draft,
    setDraft,
    mentionTokens,
    setMentionTokens,
    channelRefTokens,
    setChannelRefTokens,
  },
  edits: {
    uploadItems,
    setUploadItems,
    setRestoreBlocked,
    setRestoreFocusSignal,
    setReplyTarget,
    quoteTargets,
    setQuoteTargets,
    setSubmissionNotice,
  },
  channelId,
  channel,
  channelBots,
  conversation,
  messages,
  state,
  actions,
  t,
}: {
  draftState: ComposerTextDraft;
  edits: ComposerEdits;
  channelId: string | undefined;
  channel: ChannelSummary | undefined;
  channelBots: BotSummary[];
  conversation: ConversationStateView['conversation'];
  messages: readonly ChannelMessage[];
  state: ConversationStateView;
  actions: BridgeActions;
  t: BotHarnessTranslate;
}) {
  const restoreFailedMessage = (message: ChannelMessage): void => {
    if (channelId === undefined) return;
    if (draft.length > 0 || uploadItems.length > 0 || conversation.sending) {
      setRestoreBlocked(true);
      return;
    }
    if (message.unconfirmed === true) {
      setSubmissionNotice(t('composer.submissionChecking'));
      void actions.submissions
        .check(channelId, message.id)
        .then(async (status) => {
          if (status === 'unknown') {
            setSubmissionNotice(t('composer.submissionUncheckable'));
            return;
          }
          await actions.submissions.reconcile(channelId);
          setSubmissionNotice(
            t(
              status === 'committed'
                ? 'composer.submissionDelivered'
                : 'composer.submissionNotDelivered',
            ),
          );
        })
        .catch(() => setSubmissionNotice(t('composer.submissionUncheckable')));
      return;
    }
    if (!actions.dismissFailedMessage(channelId, message.id)) return;
    setDraft(message.body);
    setMentionTokens(message.mentions ?? []);
    setChannelRefTokens(message.channelRefs ?? []);
    setUploadItems(
      (message.attachments ?? []).map((ref) => ({
        id: crypto.randomUUID(),
        file: new File([], ref.name, { type: ref.mime }),
        ref,
        status: 'ready' as const,
      })),
    );
    setReplyTarget(
      message.replyTo === undefined
        ? undefined
        : messages.find((candidate) => candidate.id === message.replyTo),
    );
    setQuoteTargets(
      (message.quotes ?? []).flatMap((quote) => {
        const target =
          messages.find((candidate) => candidate.id === quote.messageId) ??
          (quote.preview == null
            ? undefined
            : { ...message, author: quote.preview.author, body: quote.preview.body });
        const excerpt = Array.from((quote.text ?? target?.body ?? '').replace(/\s+/gu, ' ').trim())
          .slice(0, 140)
          .join('');
        return [
          {
            messageId: quote.messageId,
            ...(quote.text === undefined ? {} : { text: quote.text }),
            ...(quote.note === undefined ? {} : { note: quote.note }),
            author:
              target === undefined
                ? t('message.replyUnavailable')
                : authorLabel(target, state.bots, t, channel),
            excerpt,
          },
        ];
      }),
    );
    setRestoreBlocked(false);
    setRestoreFocusSignal((value) => value + 1);
  };
  const quoteMessage = (message: ChannelMessage, text?: string): void => {
    if (quoteTargets.length >= MAX_DRAFT_QUOTES) return;
    const characters = Array.from(quoteSource(message, text));
    const quote: ComposerQuote = {
      messageId: message.id,
      ...(text === undefined ? {} : { text: Array.from(text.trim()).slice(0, 1000).join('') }),
      author: authorLabel(message, state.bots, t, channel),
      excerpt: characters.slice(0, 140).join(''),
    };
    setQuoteTargets((current) =>
      current.some((item) => item.messageId === quote.messageId && item.text === quote.text)
        ? current
        : current.length >= MAX_DRAFT_QUOTES
          ? current
          : [...current, quote],
    );
    const author = message.author;
    const member =
      channel?.type === 'group' && author.kind === 'bot'
        ? channelBots.find(
            (candidate) =>
              candidate.slug === author.slug &&
              candidate.deleted !== true &&
              candidate.paused !== true,
          )
        : undefined;
    if (member !== undefined) {
      const next = quoteMention(draft, mentionTokens, member.slug, member.displayName);
      recovery.update({
        text: next.value,
        mentions: next.mentions,
        channelRefs: rebaseChannelRefs(draft, next.value, channelRefTokens),
      });
    }
    window.getSelection()?.removeAllRanges();
    setRestoreFocusSignal((value) => value + 1);
  };

  const mentionBot = (botSlug: string): void => {
    const member = channelBots.find(
      (candidate) => candidate.slug === botSlug && candidate.deleted !== true,
    );
    if (channel?.type !== 'group' || member === undefined) return;
    const next = appendMention(draft, mentionTokens, member.slug, member.displayName);
    recovery.update({
      text: next.value,
      mentions: next.mentions,
      channelRefs: rebaseChannelRefs(draft, next.value, channelRefTokens),
    });
    setRestoreFocusSignal((value) => value + 1);
  };

  return { restoreFailedMessage, quoteMessage, mentionBot };
}

export function createComposerUploads({
  draftState: { recovery, draft, mentionTokens, channelRefTokens },
  edits: { uploadItems, setUploadItems, uploadControllers },
  unavailable,
  mutationLocked,
  messageHost,
}: {
  draftState: ComposerTextDraft;
  edits: ComposerEdits;
  unavailable: boolean;
  mutationLocked: boolean;
  messageHost: MessageHost | undefined;
}) {
  const startUpload = (item: ChannelComposerUpload): void => {
    if (item.fileAvailable === false || recovery.blocked || unavailable) return;
    const controller = new AbortController();
    uploadControllers.current.set(item.id, controller);
    setUploadItems((current) =>
      current.map((entry) =>
        entry.id === item.id ? { ...entry, status: 'uploading', error: undefined } : entry,
      ),
    );
    void (
      messageHost === undefined
        ? uploadChannelAttachment(item.file, controller.signal, item.id)
        : messageHost.client.upload(item.file.name, item.file).then((value) => {
            const ref = parseChannelAttachment(value);
            if (ref === undefined) throw new Error('invalid-attachment');
            return ref;
          })
    )
      .then((ref) => {
        if (controller.signal.aborted) return;
        setUploadItems((current) =>
          current.map((entry) =>
            entry.id === item.id ? { ...entry, status: 'ready', ref } : entry,
          ),
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setUploadItems((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: 'error',
                  error: error instanceof Error ? error.message : String(error),
                }
              : entry,
          ),
        );
      })
      .finally(() => {
        if (uploadControllers.current.get(item.id) === controller)
          uploadControllers.current.delete(item.id);
      });
  };

  const addFiles = (files: File[], selection?: { start: number; end: number }): number | void => {
    if (recovery.blocked || unavailable || mutationLocked) return;
    const available = Math.max(0, 10 - uploadItems.length);
    const added = files.slice(0, available).map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: 'uploading' as const,
    }));
    if (added.length === 0) return;
    const selected = insertAttachmentReferences(draft, added, selection);
    recovery.update({
      text: selected.value,
      mentions: rebaseMentions(draft, selected.value, mentionTokens),
      channelRefs: rebaseChannelRefs(draft, selected.value, channelRefTokens),
      uploads: [...uploadItems, ...added],
    });
    for (const item of added) startUpload(item);
    return selected.caret;
  };

  return { startUpload, addFiles };
}

export function createComposerSubmit({
  draftState: {
    recovery,
    draft,
    setDraft,
    mentionTokens,
    setMentionTokens,
    channelRefTokens,
    setChannelRefTokens,
    skillTokens,
    setSkillTokens,
  },
  edits: {
    uploadItems,
    setUploadItems,
    setRestoreFocusSignal,
    replyTarget,
    setReplyTarget,
    quoteTargets,
    setQuoteTargets,
    submitting,
    recall,
    setRecallNotice,
    setSubmissionNotice,
  },
  unavailable,
  conversation,
  composeAllBotMention,
  store,
  scrollRef,
  followingLatest,
  sendFlight,
  setAtLatest,
  setUnseen,
  currentChannel,
  actions,
  setAllBotNotice,
  setAllBotPreview,
  t,
}: {
  draftState: ComposerTextDraft;
  edits: ComposerEdits;
  unavailable: boolean;
  conversation: ConversationStateView['conversation'];
  composeAllBotMention: (mentions: SelectedMention[]) => Parameters<BridgeActions['send']>[7];
  store: ClientStore;
  scrollRef: { current: HTMLDivElement | null };
  followingLatest: { current: boolean };
  sendFlight: { current: SendFlight | undefined };
  setAtLatest: (atLatest: boolean) => void;
  setUnseen: (unseen: number) => void;
  currentChannel: { current: string | undefined };
  actions: BridgeActions;
  setAllBotNotice: (notice: string | undefined) => void;
  setAllBotPreview: (
    preview: Awaited<ReturnType<BridgeActions['allBotPreview']>> | undefined,
  ) => void;
  t: BotHarnessTranslate;
}): () => Promise<void> {
  const submit = async (): Promise<void> => {
    if (recovery.blocked || unavailable) return;
    const body = draft.trim();
    const leftTrim = draft.length - draft.trimStart().length;
    const submittedRefs = channelRefTokens.flatMap((token) => {
      const adjusted = {
        ...token,
        start: token.start - leftTrim,
        end: token.end - leftTrim,
      };
      return adjusted.start >= 0 && body.slice(adjusted.start, adjusted.end) === '#' + token.label
        ? [adjusted]
        : [];
    });
    const submittedSkills = liveSkills(draft, skillTokens).flatMap((token) => {
      const adjusted = {
        ...token,
        start: token.start - leftTrim,
        end: token.end - leftTrim,
      };
      return adjusted.start >= 0 && body.slice(adjusted.start, adjusted.end) === '/' + token.name
        ? [adjusted]
        : [];
    });
    const submittedMentions = mentionTokens.flatMap((token) => {
      const adjusted = {
        ...token,
        start: token.start - leftTrim,
        end: token.end - leftTrim,
      };
      return adjusted.start >= 0 && body.slice(adjusted.start, adjusted.end) === '@' + token.label
        ? [adjusted]
        : [];
    });
    const allBotMention = composeAllBotMention(submittedMentions);
    if (allBotMention?.preview.recipients.length === 0) return;
    if (
      (body.length === 0 && uploadItems.length === 0) ||
      uploadItems.length > 10 ||
      uploadItems.some((item) => item.status !== 'ready' || item.ref === undefined) ||
      conversation.sending ||
      submitting.current
    )
      return;
    submitting.current = true;
    const composerFocused =
      document.activeElement instanceof Element &&
      document.activeElement.closest('.bh-composer-shell') !== null;
    const viewport = scrollRef.current;
    followingLatest.current = sendFollowsLatest(viewport, conversation.timeline.hasNewer);
    sendFlight.current = launchSendFlight(
      viewport,
      conversation.timeline.hasNewer,
      store.getSnapshot().conversation.messages,
    );
    setAtLatest(followingLatest.current);
    if (followingLatest.current) setUnseen(0);
    const submittedFor = currentChannel.current;
    const submittedUploads = uploadItems;
    const previousFailures = new Set(
      store
        .getSnapshot()
        .conversation.messages.filter((item) => item.failed !== undefined)
        .map((item) => item.id),
    );
    const submittedReplyTo = replyTarget?.id;
    const submittedQuotes = quoteTargets.map(({ messageId, text, note }) =>
      quoteRefOf({
        messageId,
        ...(text === undefined ? {} : { text }),
        ...(note?.trim() ? { note: note.trim() } : {}),
      }),
    );
    const submittedAttachments = submittedUploads.flatMap((item) =>
      item.ref === undefined ? [] : [item.ref],
    );
    const attempt =
      submittedFor === undefined
        ? undefined
        : actions.submissions.begin(submittedFor, {
            text: body,
            mentions: submittedMentions.flatMap((item) =>
              item.kind === 'all-bots'
                ? []
                : [
                    {
                      botSlug: item.botSlug,
                      label: item.label,
                      start: item.start,
                      end: item.end,
                    },
                  ],
            ),
            channelRefs: submittedRefs,
            ...(submittedReplyTo === undefined ? {} : { replyTo: submittedReplyTo }),
            ...(submittedQuotes.length === 0 ? {} : { quotes: submittedQuotes }),
            ...(submittedAttachments.length === 0 ? {} : { attachments: submittedAttachments }),
          });
    setSubmissionNotice(
      attempt?.persisted === false ? t('composer.submissionStorageError') : undefined,
    );
    recall.current = undefined;
    setRecallNotice(undefined);
    recovery.update({
      text: '',
      mentions: [],
      channelRefs: [],
      skills: [],
      uploads: [],
    });
    try {
      const sent = await actions.send(
        body,
        submittedReplyTo,
        submittedAttachments,
        undefined,
        submittedMentions.filter((item) => item.kind !== 'all-bots'),
        submittedRefs,
        undefined,
        allBotMention,
        attempt?.id,
        submittedSkills.map(({ name, owner, start, end }) => ({
          name,
          owner,
          start,
          end,
        })),
        submittedQuotes,
      );
      if (sent) {
        setAllBotNotice(undefined);
        if (submittedQuotes.length > 0)
          setQuoteTargets((current) =>
            current.filter(
              (item) =>
                !submittedQuotes.some(
                  (sentQuote) =>
                    sentQuote.messageId === item.messageId &&
                    sentQuote.text === item.text &&
                    sentQuote.note === (item.note?.trim() || undefined),
                ),
            ),
          );
        setReplyTarget((current) => (current?.id === submittedReplyTo ? undefined : current));
      } else if (currentChannel.current === submittedFor) {
        const failedEcho = store
          .getSnapshot()
          .conversation.messages.some(
            (item) => item.failed !== undefined && !previousFailures.has(item.id),
          );
        if (!failedEcho) {
          if (attempt !== undefined && submittedFor !== undefined)
            actions.submissions.cancel(submittedFor, attempt.id);
          let draftRestored = false;
          setDraft((current) => {
            draftRestored = current.length === 0;
            return current || body;
          });
          setMentionTokens((current) => (current.length > 0 ? current : submittedMentions));
          setChannelRefTokens((current) => (current.length > 0 ? current : submittedRefs));
          if (draftRestored)
            setSkillTokens((current) => (current.length > 0 ? current : submittedSkills));
          setUploadItems((current) => (current.length > 0 ? current : submittedUploads));
        }
      }
    } catch (error) {
      if (
        error instanceof BridgeCallError &&
        error.code === 'all-bot-preview-changed' &&
        currentChannel.current === submittedFor &&
        submittedFor !== undefined
      ) {
        const preview =
          parseAllBotPreview((error.details as { preview?: unknown } | undefined)?.preview) ??
          (await actions.allBotPreview(submittedFor).catch(() => undefined));
        if (currentChannel.current !== submittedFor) return;
        store.setConversation({ error: undefined });
        setAllBotNotice(t('composer.allBotsChanged'));
        setAllBotPreview(preview);
        let draftRestored = false;
        setDraft((current) => {
          draftRestored = current.length === 0;
          return current || body;
        });
        setMentionTokens((current) =>
          current.length > 0
            ? current
            : submittedMentions.map((item) =>
                item.kind === 'all-bots' && preview !== undefined ? { ...item, preview } : item,
              ),
        );
        setChannelRefTokens((current) => (current.length > 0 ? current : submittedRefs));
        if (draftRestored)
          setSkillTokens((current) => (current.length > 0 ? current : submittedSkills));
        setUploadItems((current) => (current.length > 0 ? current : submittedUploads));
      } else throw error;
    } finally {
      submitting.current = false;
      if (composerFocused && currentChannel.current === submittedFor)
        setRestoreFocusSignal((value) => value + 1);
    }
  };

  return submit;
}
