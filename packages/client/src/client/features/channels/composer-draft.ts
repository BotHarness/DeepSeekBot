import type {
  ConversationStateView,
  BotSummary,
  ChannelMessage,
  ChannelSummary,
} from '../../store.js';
import { useScopedRef, useScopedState } from '../../scoped-state.js';
import { useConversationFileDrop } from '../../conversation-file-drop.js';
import { useRef, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';
import type { BridgeActions } from '../../actions.js';
import { useComposerSessionOptions } from '../../composer-session-options.js';
import type { SelectedMention } from '../../mentions.js';
import type { SelectedChannelRef } from '../../channel-refs.js';
import { recallEntries, stepRecall, SUBMISSION_PREFIX } from '../../composer-submission-store.js';
import { useConversationDraft, type useComposerRecovery } from '../../conversation-draft.js';
import type { ComposerSkillOption, ChannelComposerProps } from '../../channel-composer.js';
import type { BotHarnessTranslate } from '../../locale.js';
import { useMountedResource } from '../../mounted-resource.js';
import { authorLabel, quoteSource } from './message-labels.js';
import type { ComposerDraft } from '../../composer-draft-store.js';

export interface ComposerTextDraft {
  draftScope: string | undefined;
  recovery: ReturnType<typeof useComposerRecovery>;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  mentionTokens: ComposerDraft['mentions'];
  setMentionTokens: Dispatch<SetStateAction<ComposerDraft['mentions']>>;
  channelRefTokens: ComposerDraft['channelRefs'];
  setChannelRefTokens: Dispatch<SetStateAction<ComposerDraft['channelRefs']>>;
  skillTokens: ComposerDraft['skills'];
  setSkillTokens: Dispatch<SetStateAction<ComposerDraft['skills']>>;
}

export function useComposerEdits(scopeKey: string, draftScope: string | undefined) {
  const [uploadItems, setUploadItems] = useConversationDraft(draftScope, 'uploads', []);
  const [restoreBlocked, setRestoreBlocked] = useScopedState(scopeKey, false);
  const [restoreFocusSignal, setRestoreFocusSignal] = useScopedState(scopeKey, 0);
  const uploadControllers = useScopedRef(scopeKey, new Map<string, AbortController>());
  const [replyTarget, setReplyTarget] = useConversationDraft(draftScope, 'reply', undefined);
  const [quoteTargets, setQuoteTargets] = useConversationDraft(draftScope, 'quotes', []);
  const submitting = useScopedRef(scopeKey, false);
  const recall = useScopedRef<
    | {
        scope: string;
        index: number;
        text: string;
        saved: {
          text: string;
          mentions: SelectedMention[];
          channelRefs: SelectedChannelRef[];
        };
      }
    | undefined
  >(scopeKey, undefined);
  const [recallNotice, setRecallNotice] = useScopedState<string>(scopeKey);
  const [submissionNotice, setSubmissionNotice] = useScopedState<string>(scopeKey);

  return {
    uploadItems,
    setUploadItems,
    restoreBlocked,
    setRestoreBlocked,
    restoreFocusSignal,
    setRestoreFocusSignal,
    uploadControllers,
    replyTarget,
    setReplyTarget,
    quoteTargets,
    setQuoteTargets,
    submitting,
    recall,
    recallNotice,
    setRecallNotice,
    submissionNotice,
    setSubmissionNotice,
  };
}

export type ComposerEdits = ReturnType<typeof useComposerEdits>;

export function useComposerSubmissions(
  draftScope: string | undefined,
  state: ConversationStateView,
  actions: BridgeActions,
) {
  const submissionChannelId = draftScope === undefined ? undefined : state.conversation.channel?.id;
  const readSubmissions = () =>
    submissionChannelId === undefined
      ? undefined
      : actions.submissions.snapshot(submissionChannelId);
  const submissionSnapshot = useSyncExternalStore(
    actions.submissions.subscribe,
    readSubmissions,
    readSubmissions,
  );
  const submissionMount = useMountedResource<HTMLSpanElement>(() => {
    if (submissionChannelId === undefined) return;
    const sync = (event: StorageEvent): void => {
      if (event.key === null || event.key.startsWith(SUBMISSION_PREFIX))
        actions.submissions.sync(submissionChannelId);
    };
    window.addEventListener('storage', sync);
    void actions.submissions.reconcile(submissionChannelId);
    return () => window.removeEventListener('storage', sync);
  }, [actions, submissionChannelId]);

  return { submissionMount, submissionSnapshot };
}

export type ComposerSubmissions = ReturnType<typeof useComposerSubmissions>;

export function createComposerRecall({
  draftState: { draftScope, recovery, draft, mentionTokens, channelRefTokens },
  edits: { recall, setRecallNotice },
  submissions: { submissionSnapshot },
  state,
  channel,
  t,
}: {
  draftState: ComposerTextDraft;
  edits: ComposerEdits;
  submissions: ComposerSubmissions;
  state: ConversationStateView;
  channel: ChannelSummary | undefined;
  t: BotHarnessTranslate;
}): (direction: 'older' | 'newer') => boolean {
  const recallInput = (direction: 'older' | 'newer'): boolean => {
    if (draftScope === undefined || recovery.blocked) return false;
    const entries = recallEntries(submissionSnapshot?.attempts ?? []);
    const active = recall.current?.scope === draftScope ? recall.current : undefined;
    const step = stepRecall(active, direction, draft, entries);
    if (step.kind === 'ignore') {
      if (recall.current !== undefined) {
        recall.current = undefined;
        setRecallNotice(undefined);
      }
      return false;
    }
    if (step.kind === 'stay') return true;
    const saved =
      active !== undefined && active.text === draft
        ? active.saved
        : {
            text: draft,
            mentions: mentionTokens,
            channelRefs: channelRefTokens,
          };
    if (step.kind === 'restore') {
      recall.current = undefined;
      setRecallNotice(undefined);
      recovery.update(saved);
      return true;
    }
    const entry = step.entry;
    const mentions = entry.mentions.filter(
      (mention) =>
        state.bots.some(
          (bot) => bot.slug === mention.botSlug && bot.paused !== true && !bot.deleted,
        ) &&
        (channel?.type !== 'group' || channel.members.includes(mention.botSlug)),
    );
    const channelRefs = entry.channelRefs.filter((ref) =>
      state.channels.some((item) => item.id === ref.channelId && item.type === 'group'),
    );
    recall.current = { scope: draftScope, ...step.cursor, saved };
    recovery.update({ text: entry.text, mentions, channelRefs });
    const dropped =
      mentions.length !== entry.mentions.length || channelRefs.length !== entry.channelRefs.length;
    const omitted = entry.replyTo !== undefined || (entry.attachments?.length ?? 0) > 0;
    const notice =
      (omitted ? t('composer.recallOmitted') : '') + (dropped ? t('composer.recallDropped') : '');
    setRecallNotice(notice === '' ? undefined : notice.trim());
    return true;
  };

  return recallInput;
}

export function useComposerResources({
  scopeKey,
  channelId,
  channel,
  channelBots,
  actions,
  state,
  botDm,
  sessionItems,
  setAllBotPreview,
  skillCatalog,
  setSkillCatalog,
}: {
  scopeKey: string;
  channelId: string | undefined;
  channel: ChannelSummary | undefined;
  channelBots: BotSummary[];
  actions: BridgeActions;
  state: ConversationStateView;
  botDm: boolean;
  sessionItems: Parameters<typeof useComposerSessionOptions>[0]['dmSessions'];
  setAllBotPreview: Dispatch<SetStateAction<ChannelComposerProps['allBotPreview']>>;
  skillCatalog: Awaited<ReturnType<NonNullable<BridgeActions['skillCatalog']>>> | undefined;
  setSkillCatalog: Dispatch<
    SetStateAction<Awaited<ReturnType<NonNullable<BridgeActions['skillCatalog']>>> | undefined>
  >;
}) {
  const previewRoster = channelBots
    .map((bot) => [bot.slug, bot.paused, bot.displayName].join(':'))
    .join('|');
  const allBotPreviewMount = useMountedResource<HTMLSpanElement>(() => {
    let cancelled = false;
    setAllBotPreview(undefined);
    if (channel?.type === 'group')
      void actions
        .allBotPreview(channel.id)
        .then((preview) => {
          if (!cancelled) setAllBotPreview(preview);
        })
        .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [scopeKey, channelId, previewRoster]);
  const skillCatalogMount = useMountedResource<HTMLSpanElement>(() => {
    let cancelled = false;
    let generation = 0;
    setSkillCatalog(undefined);
    const loadSkills = actions.skillCatalog;
    if (
      !((channel?.type === 'dm' && channel.botSlug !== undefined) || channel?.type === 'group') ||
      loadSkills === undefined
    )
      return () => {
        cancelled = true;
      };
    const targetId = channel.id;
    const load = (): void => {
      const current = ++generation;
      void loadSkills(targetId)
        .then((skills) => {
          if (!cancelled && current === generation) setSkillCatalog(skills);
        })
        .catch(() => undefined);
    };
    const unsubscribe = actions.subscribeSkillCatalog?.(targetId, load);
    load();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [scopeKey, channelId, previewRoster]);
  const skillOptions: ComposerSkillOption[] = (skillCatalog ?? []).map((entry) => ({
    ...entry,
    bot:
      entry.owner.kind === 'bot'
        ? state.bots.find((bot) => entry.owner.kind === 'bot' && bot.slug === entry.owner.botSlug)
        : undefined,
  }));
  const composerSessions = useComposerSessionOptions({
    channel: botDm ? undefined : channel,
    bots: state.bots,
    dmSessions: sessionItems,
    readSessions: actions.readSessions,
    refreshDmSessions: actions.refreshSessions,
  });

  return { allBotPreviewMount, skillCatalogMount, skillOptions, composerSessions };
}

export function composerQuoteLabels(
  quoteTargets: ComposerDraft['quotes'],
  messages: readonly ChannelMessage[],
  state: ConversationStateView,
  channel: ChannelSummary | undefined,
  t: BotHarnessTranslate,
): ComposerDraft['quotes'] {
  return quoteTargets.map((quote) => {
    if (quote.author !== undefined) return quote;
    const target = messages.find((candidate) => candidate.id === quote.messageId) ?? quote.target;
    if (target === undefined) return quote;
    return {
      ...quote,
      author: authorLabel(target, state.bots, t, channel),
      excerpt: Array.from(quoteSource(target, quote.text)).slice(0, 140).join(''),
    };
  });
}

export function useComposerFileDrop({
  mutationLocked,
  unavailable,
  conversation,
  recovery,
  activeMemoryView,
  selectedIds,
  addFiles,
  setRestoreFocusSignal,
  scopeKey,
}: {
  mutationLocked: boolean;
  unavailable: boolean;
  conversation: ConversationStateView['conversation'];
  recovery: ComposerTextDraft['recovery'];
  activeMemoryView: object | undefined;
  selectedIds: readonly string[] | undefined;
  addFiles: NonNullable<ChannelComposerProps['onAddFiles']>;
  setRestoreFocusSignal: ComposerEdits['setRestoreFocusSignal'];
  scopeKey: string;
}) {
  const dictating = useRef(false);
  const fileDrop = useConversationFileDrop(
    !mutationLocked &&
      !unavailable &&
      !conversation.sending &&
      !recovery.blocked &&
      activeMemoryView === undefined &&
      selectedIds === undefined,
    (files) => {
      if (dictating.current) return;
      addFiles(files);
      setRestoreFocusSignal((value) => value + 1);
    },
    scopeKey,
  );

  return { dictating, fileDrop };
}
