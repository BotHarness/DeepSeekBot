import { AnnouncementGate } from '../../announcement-gate.js';
import type {
  ConversationStateView,
  BotSummary,
  ChannelSummary,
  ClientStore,
} from '../../store.js';
import type { VoiceDictationPort } from '../../composer-dictation.js';
import type { ReactElement } from 'react';
import { Toast } from '../../ds/toast.js';
import type { BridgeActions } from '../../actions.js';
import { useComposerSessionOptions } from '../../composer-session-options.js';
import {
  ChannelComposer,
  type ChannelComposerUpload,
  type ChannelComposerProps,
} from '../../channel-composer.js';
import { removeAttachmentReferences } from '../../attachment-refs.js';
import type { BotHarnessTranslate } from '../../locale.js';
import { authorLabel } from './message-labels.js';
import type { ComposerEdits, ComposerSubmissions, ComposerTextDraft } from './composer-draft.js';
import type { ComposerCompactNotice } from './composer-context.js';

export function renderConversationComposer({
  draftState: { draftScope, recovery, draft, mentionTokens, channelRefTokens, skillTokens },
  edits: {
    uploadItems,
    setUploadItems,
    setRestoreBlocked,
    restoreFocusSignal,
    uploadControllers,
    replyTarget,
    setReplyTarget,
    setQuoteTargets,
    recallNotice,
    submissionNotice,
  },
  submissions: { submissionMount, submissionSnapshot },
  channel,
  channelId,
  activeMemoryView,
  selectedIds,
  compactNotice,
  setCompactNotice,
  actions,
  followingLatest,
  pinTimelineToLatest,
  store,
  composerContext,
  sendKey,
  skillOptions,
  composerSessions,
  state,
  allBotPreview,
  allBotNotice,
  channelBots,
  title,
  dictationPort,
  dictating,
  conversation,
  unavailable,
  addFiles,
  startUpload,
  composerQuotes,
  recallInput,
  submit,
  t,
}: {
  draftState: ComposerTextDraft;
  edits: ComposerEdits;
  submissions: ComposerSubmissions;
  channel: ChannelSummary | undefined;
  channelId: string | undefined;
  activeMemoryView: object | undefined;
  selectedIds: readonly string[] | undefined;
  compactNotice: ComposerCompactNotice | undefined;
  setCompactNotice: (
    update: (current: ComposerCompactNotice | undefined) => ComposerCompactNotice | undefined,
  ) => void;
  actions: BridgeActions;
  followingLatest: { current: boolean };
  pinTimelineToLatest: (element: HTMLElement) => void;
  store: ClientStore;
  composerContext: ChannelComposerProps['context'];
  sendKey: ChannelComposerProps['sendKey'];
  skillOptions: ChannelComposerProps['skillOptions'];
  composerSessions: ReturnType<typeof useComposerSessionOptions>;
  state: ConversationStateView;
  allBotPreview: ChannelComposerProps['allBotPreview'];
  allBotNotice: ChannelComposerProps['allBotNotice'];
  channelBots: BotSummary[];
  title: string;
  dictationPort: VoiceDictationPort | undefined;
  dictating: { current: boolean };
  conversation: ConversationStateView['conversation'];
  unavailable: boolean;
  addFiles: NonNullable<ChannelComposerProps['onAddFiles']>;
  startUpload: (item: ChannelComposerUpload) => void;
  composerQuotes: ChannelComposerProps['quotes'];
  recallInput: NonNullable<ChannelComposerProps['onRecall']>;
  submit: ChannelComposerProps['onSubmit'];
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <div
      className="bh-memory-chat-composer"
      style={{
        display: activeMemoryView === undefined && selectedIds === undefined ? 'contents' : 'none',
      }}
    >
      {compactNotice === undefined ? null : (
        <Toast
          key={compactNotice.seq}
          text={compactNotice.text}
          holdMs={compactNotice.holdMs}
          {...(compactNotice.tone ? { tone: compactNotice.tone } : {})}
          onDone={() =>
            setCompactNotice((current) =>
              current?.seq === compactNotice.seq ? undefined : current,
            )
          }
        />
      )}
      <div
        className="bh-composer-recovery"
        ref={recovery.mount}
        onFocusCapture={() => recovery.setEditing(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            recovery.setEditing(false);
        }}
      >
        {draftScope === undefined ? (
          <p role="status">{t('composer.draftIdentityUnavailable')}</p>
        ) : null}
        {draftScope !== undefined && recovery.error !== undefined ? (
          <p role="alert">{t('composer.draftStorageError')}</p>
        ) : null}
        {recovery.needsValidation && recovery.versions.length <= 1 ? (
          <p role="status">
            {t(
              recovery.validationFailed
                ? 'composer.draftValidationFailed'
                : 'composer.draftValidating',
            )}{' '}
            {recovery.validationFailed ? (
              <button type="button" onClick={recovery.retry}>
                {t('composer.draftRetry')}
              </button>
            ) : null}
          </p>
        ) : null}
        {recovery.notice ? <p role="status">{t('composer.draftReferencesChanged')}</p> : null}
        <span ref={submissionMount} hidden />
        {submissionSnapshot?.error !== undefined ? (
          <p role="alert">{t('composer.submissionStorageError')}</p>
        ) : submissionNotice === undefined ? null : (
          <p role="status">{submissionNotice}</p>
        )}
        {recallNotice === undefined ? null : <p role="status">{recallNotice}</p>}
        {recovery.versions.length > 1 ? (
          <section aria-label={t('composer.draftConflict')}>
            <p role="alert">{t('composer.draftConflict')}</p>
            {recovery.versions.map((version) => (
              <div className="bh-composer-draft-version" key={version.writer}>
                <pre>{version.draft.text.slice(0, 240)}</pre>
                <button type="button" onClick={() => recovery.choose(version.writer)}>
                  {t('composer.draftUseVersion')}
                </button>
              </div>
            ))}
          </section>
        ) : null}
        <AnnouncementGate
          call={channel?.type === 'group' ? actions.teamCall : undefined}
          channelId={channelId ?? ''}
          refreshKey={channel}
          t={t}
        >
          <ChannelComposer
            key={channelId}
            onOverlayResize={(timeline) => {
              if (followingLatest.current && !store.getSnapshot().conversation.timeline.hasNewer)
                pinTimelineToLatest(timeline);
            }}
            context={composerContext}
            sendKey={sendKey}
            value={draft}
            mentions={mentionTokens}
            channelRefs={channelRefTokens}
            skills={skillTokens}
            skillOptions={skillOptions}
            readSkill={actions.skillDetail}
            sessionOptions={composerSessions.options}
            onSessionMenu={composerSessions.refresh}
            channelCandidates={
              channel?.type === 'dm' && channel.botSlug !== undefined
                ? state.channels.filter((candidate) => candidate.type === 'group')
                : []
            }
            allBotPreview={channel?.type === 'group' ? allBotPreview : undefined}
            allBotNotice={allBotNotice}
            mentionCandidates={
              channel?.type === 'group'
                ? channelBots
                : channel?.type === 'dm' && channel.botSlug !== undefined
                  ? state.bots.filter(
                      (candidate) =>
                        candidate.slug !== channel.botSlug &&
                        candidate.paused !== true &&
                        !candidate.deleted,
                    )
                  : []
            }
            placeholder={channel?.readOnly === true ? t('composer.readOnly') : ''}
            label={t('composer.label', { name: title })}
            holdPlaceholder={t('composer.holdToTalk', { name: title })}
            dictation={dictationPort}
            dictating={dictating}
            sending={conversation.sending || recovery.blocked}
            disabled={unavailable || channel?.readOnly === true}
            focusSignal={restoreFocusSignal}
            attachments={uploadItems}
            onAddFiles={addFiles}
            onRetryAttachment={(id) => {
              const item = uploadItems.find((candidate) => candidate.id === id);
              if (item !== undefined) startUpload(item);
            }}
            onRemoveAttachment={(id) => {
              const item = uploadItems.find((candidate) => candidate.id === id);
              if (item !== undefined) {
                const next = removeAttachmentReferences(
                  draft,
                  item,
                  mentionTokens,
                  channelRefTokens,
                );
                recovery.update({
                  text: next.value,
                  mentions: next.mentions,
                  channelRefs: next.channelRefs,
                });
              }
              uploadControllers.current.get(id)?.abort();
              uploadControllers.current.delete(id);
              setUploadItems((current) => current.filter((item) => item.id !== id));
            }}
            reply={
              replyTarget === undefined
                ? undefined
                : {
                    id: replyTarget.id,
                    author: authorLabel(replyTarget, state.bots, t, channel),
                    body: replyTarget.body,
                  }
            }
            t={t}
            onChange={(value, mentions, channelRefs, skills) => {
              recovery.update({
                text: value,
                mentions: mentions ?? [],
                channelRefs: channelRefs ?? [],
                ...(skills === undefined ? {} : { skills }),
              });
              setRestoreBlocked(false);
            }}
            onCancelReply={() => setReplyTarget(undefined)}
            quotes={composerQuotes}
            onRemoveQuote={(quote) =>
              setQuoteTargets((current) =>
                current.filter(
                  (item) => item.messageId !== quote.messageId || item.text !== quote.text,
                ),
              )
            }
            onQuoteNote={(quote, note) =>
              setQuoteTargets((current) =>
                current.map((item) =>
                  item.messageId === quote.messageId && item.text === quote.text
                    ? { ...item, note }
                    : item,
                ),
              )
            }
            onRecall={recallInput}
            onSubmit={submit}
          />
        </AnnouncementGate>
      </div>
    </div>
  );
}
