import { BridgeAudio } from './bridge-audio.js';
import { BridgeFile } from './bridge-file.js';
import { UserQuestionCard } from './user-question-card.js';
import { PrivateInputCard } from './private-input-card.js';
import { ToolApprovalCard } from './tool-approval-card.js';
import { OnboardingWelcome } from './onboarding-view.js';
import { BridgeImage } from './bridge-image.js';
import { ExternalMessageText } from './external-message-text.js';
import { MessageAttachment } from './message-attachment.js';
import { useMemo, useRef, useState, type ReactElement } from 'react';

import {
  Button,
  FileTypeIcon,
  fileSizeText,
  MarkdownText,
  StateDot,
  Tag,
  type MarkdownLabels,
} from '@deepseek-ai/dsh-client-ui-primitives';

import { errorMessage } from './bridge.js';
import { PersonaBotAvatar } from './avatar.js';
import { botNameSource, paintBotName } from './bot-primary-color.js';
import { openModelsSettings } from './bot-settings-open.js';
import { currentMentionLabel } from './actor-names.js';
import type { ChannelHumanMember } from './store.js';
import { referenceRuns } from './channel-refs.js';
import { preserveHumanLineBreaks, rendersHumanMarkdown } from './human-markdown.js';
import { attachmentReferenceRuns, messageAttachmentReferences } from './attachment-refs.js';
import type { BridgeActions, HostDirectoryListing } from './actions.js';
import { FolderBrowser } from './workspace-grants-entry.js';
import type { BotHarnessTranslate } from './locale.js';
import { toolApprovalText } from './approval-text.js';
import { store, type BotSummary, type ChannelMessage } from './store.js';
import { useMountedResource } from './mounted-resource.js';

const ChannelMarkdownText = MarkdownText as unknown as (
  props: Parameters<typeof MarkdownText>[0],
) => ReactElement;

export type NativeChatFailureText = (key: 'message.turnError' | 'message.failure.auth') => string;

function failureSummary(
  failure: NonNullable<ChannelMessage['sessionFailure']>,
  t: BotHarnessTranslate,
  nativeChatT?: NativeChatFailureText,
): string {
  switch (failure.code) {
    case 'AUTH':
      return nativeChatT?.('message.failure.auth') ?? t('failure.auth');
    case 'MISSING_CREDENTIAL':
      return t('failure.missingCredential');
    case 'INVALID_CREDENTIAL':
      return t('failure.invalidCredential');
    case 'QUOTA':
      return t('failure.quota');
    case 'RATE_LIMIT':
      return t('failure.rateLimit');
    case 'TRANSPORT':
      return t('failure.transport');
    case 'TIMEOUT':
      return t('failure.timeout');
    case 'SERVER':
      return t('failure.server');
    default:
      return t('failure.generic');
  }
}

function SessionFailureNotice({
  message,
  channelId,
  actions,
  t,
  nativeChatT,
}: {
  message: ChannelMessage;
  channelId?: string | undefined;
  actions?: BridgeActions | undefined;
  t: BotHarnessTranslate;
  nativeChatT?: NativeChatFailureText | undefined;
}): ReactElement {
  const failure = message.sessionFailure!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const title = nativeChatT?.('message.turnError') ?? t('failure.title');
  const needsModels = ['AUTH', 'MISSING_CREDENTIAL', 'INVALID_CREDENTIAL', 'QUOTA'].includes(
    failure.code ?? '',
  );
  return (
    <div className="bh-session-failure-row" role="alert">
      <div className="bh-session-failure-heading">
        <StateDot state="error" />
        <span className="bh-session-failure-title">{title}</span>
        <span className="bh-session-failure-summary">
          {failureSummary(failure, t, nativeChatT)}
        </span>
        {failure.code === undefined ? null : (
          <code className="bh-session-failure-code">{failure.code}</code>
        )}
      </div>
      {failure.context === undefined ? null : (
        <div className="bh-session-failure-context">
          {t('failure.assignmentContext', { context: failure.context })}
        </div>
      )}
      <details className="bh-session-failure-details">
        <summary>{t('failure.details')}</summary>
        <div>
          {t('failure.role', {
            role:
              failure.role === 'assignment' ? t('approval.assignment') : t('approval.orchestrator'),
          })}
        </div>
        {failure.status === undefined ? null : <div>HTTP {failure.status}</div>}
        <div className="bh-session-failure-raw">{failure.detail}</div>
        <code>{failure.sessionId}</code>
      </details>
      {needsModels || (failure.requestMessageId && actions && channelId) ? (
        <div className="bh-message-card-actions">
          {needsModels ? (
            <Button variant="outline" onClick={() => openModelsSettings()}>
              {t('failure.openModels')}
            </Button>
          ) : null}
          {failure.requestMessageId && actions && channelId ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError(undefined);
                void actions
                  .retryMessage(channelId, failure.requestMessageId!)
                  .catch((cause) => setError(errorMessage(cause)))
                  .finally(() => setBusy(false));
              }}
            >
              {t('onboarding.retryMessage')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

export { MessageDeveloperMode } from './message-developer-mode.js';

export function GrantRequestCard({
  message,
  actions,
  resolved,
  workspacePickerRequest,
  compact = false,
  beforeOpen,
  channelId,
  t,
}: {
  message: ChannelMessage;
  actions: BridgeActions;
  channelId?: string | undefined;
  workspacePickerRequest?: number | undefined;
  resolved: boolean;
  compact?: boolean;
  beforeOpen?: () => Promise<boolean>;
  t: BotHarnessTranslate;
}): ReactElement {
  const [listing, setListing] = useState<HostDirectoryListing | undefined>();
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const botSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
  const open = (alreadyChecked = false): void => {
    if (botSlug === undefined || busy || opening || resolved || completed) return;
    setOpening(true);
    setError(undefined);
    void (async () => {
      if (!alreadyChecked && beforeOpen !== undefined && !(await beforeOpen())) return;
      return actions.listHostFolders().then(setListing, async (cause: unknown) => {
        if (
          cause instanceof Error &&
          'rpcError' in cause &&
          typeof cause.rpcError === 'object' &&
          cause.rpcError !== null &&
          'code' in cause.rpcError &&
          cause.rpcError.code === 'directory-picker/unavailable'
        ) {
          const path = await actions.pickWorkspaceFolder();
          if (path !== null) approve(path);
          return;
        }
        setError(errorMessage(cause));
      });
    })()
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setOpening(false));
  };
  const approve = (path: string): void => {
    if (botSlug === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    void (async () => {
      try {
        await actions.resolveWorkspaceGrantRequest(
          botSlug,
          message.id,
          path,
          (name) => t('grant.requestApprovedMessage', { name }),
          channelId,
        );
        setCompleted(true);
        setListing(undefined);
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setBusy(false);
      }
    })();
  };
  const openedRequest = useRef<number>();
  const pickerTrigger = useMountedResource<HTMLDivElement>(() => {
    if (
      workspacePickerRequest !== undefined &&
      workspacePickerRequest !== openedRequest.current &&
      !resolved &&
      !completed
    ) {
      openedRequest.current = workspacePickerRequest;
      open(true);
    }
  }, [workspacePickerRequest]);
  const chooseButton = (
    <Button
      variant="primary"
      size={compact ? 'sm' : 'md'}
      disabled={busy || opening}
      onClick={() => open()}
    >
      {opening
        ? t('grant.loading')
        : t(compact ? 'humanInbox.grant.handle' : 'grant.requestChoose')}
    </Button>
  );
  return (
    <div
      className={compact ? 'bh-human-inbox-grant-action' : 'bh-grant-request-card'}
      ref={pickerTrigger}
    >
      {compact ? null : (
        <>
          <div className="bh-grant-request-title">{t('grant.requestTitle')}</div>
          <div className="bh-grant-request-reason">{message.body}</div>
        </>
      )}
      {resolved || completed ? (
        <div className="bh-note" role="status">
          {t('grant.requestResolved')}
        </div>
      ) : compact ? (
        chooseButton
      ) : (
        <div className="bh-message-card-actions">{chooseButton}</div>
      )}
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
      {listing === undefined ? null : (
        <FolderBrowser
          initial={listing}
          actions={actions}
          onCancel={() => setListing(undefined)}
          onChoose={approve}
          busy={busy}
          t={t}
        />
      )}
    </div>
  );
}

function leadingBotMentions(message: ChannelMessage):
  | {
      mentions: (
        | NonNullable<ChannelMessage['mentions']>[number]
        | NonNullable<ChannelMessage['humanMentions']>[number]
      )[];
      text: string;
    }
  | undefined {
  if (message.author.kind !== 'bot' && message.author.kind !== 'human') return undefined;
  const mentions = [...(message.mentions ?? []), ...(message.humanMentions ?? [])].sort(
    (left, right) => left.start - right.start,
  );
  if (mentions.length === 0) return undefined;
  let cursor = 0;
  for (const mention of mentions) {
    if (
      mention.start !== cursor ||
      message.body.slice(mention.start, mention.end) !== '@' + mention.label
    )
      return undefined;
    cursor = mention.end;
    if (message.body[cursor] === ' ') cursor += 1;
    else if (cursor < message.body.length) return undefined;
  }
  return { mentions, text: message.body.slice(cursor) };
}

export function ChannelMessageBody({
  message: storedMessage,
  channelId,
  t,
  actions,
  bots = [],
  humanMembers = [],
  grantRequestResolved = false,
  workspacePickerRequest,
  toolApprovalDecision,
  userQuestionResolution,
  nativeChatT,
}: {
  message: ChannelMessage;
  channelId?: string | undefined;
  t: BotHarnessTranslate;
  actions?: BridgeActions;
  bots?: readonly BotSummary[];
  humanMembers?: readonly ChannelHumanMember[];
  grantRequestResolved?: boolean;
  workspacePickerRequest?: number | undefined;
  nativeChatT?: NativeChatFailureText | undefined;
  toolApprovalDecision?:
    | 'allowed-once'
    | 'allowed-always-exact'
    | 'allowed-always-all'
    | 'rejected'
    | undefined;
  userQuestionResolution?: 'answered' | 'cancelled' | undefined;
}): ReactElement {
  const labels = useMemo<MarkdownLabels>(
    () => ({
      code: {
        copyLabel: t('message.code.copy'),
        copiedLabel: t('message.code.copied'),
      },
      footnotes: t('message.footnotes'),
    }),
    [t],
  );
  const approvalBody = toolApprovalText(storedMessage, t);
  const message =
    approvalBody === undefined ? storedMessage : { ...storedMessage, body: approvalBody };
  const humanMarkdown = rendersHumanMarkdown(message);
  const format =
    message.format ?? (message.author.kind === 'human' && !humanMarkdown ? 'text' : 'markdown');
  if (message.contentPurged) return <div className="bh-bubble-body">{t('purge.purged')}</div>;
  if (message.onboardingWelcome !== undefined && actions !== undefined && channelId !== undefined)
    return <OnboardingWelcome actions={actions} channelId={channelId} t={t} />;
  if (message.sessionFailure !== undefined)
    return (
      <SessionFailureNotice
        message={message}
        channelId={channelId}
        actions={actions}
        t={t}
        nativeChatT={nativeChatT}
      />
    );
  if (message.toolApprovalRequest !== undefined && actions !== undefined) {
    return (
      <ToolApprovalCard
        message={message}
        actions={actions}
        decision={toolApprovalDecision}
        channelId={channelId}
        t={t}
      />
    );
  }
  if (message.privateInputRequest !== undefined && actions !== undefined) {
    return <PrivateInputCard message={message} actions={actions} channelId={channelId} t={t} />;
  }
  if (message.userQuestionRequest !== undefined && actions !== undefined) {
    return (
      <UserQuestionCard
        message={message}
        actions={actions}
        resolution={userQuestionResolution}
        channelId={channelId}
        t={t}
      />
    );
  }
  if (message.grantRequest === true && actions !== undefined) {
    return (
      <GrantRequestCard
        message={message}
        actions={actions}
        resolved={grantRequestResolved || message.grantRequestResolved === true}
        channelId={channelId}
        workspacePickerRequest={workspacePickerRequest}
        t={t}
      />
    );
  }
  if (message.bridgeMedia && message.bridgeOrigin && channelId) {
    const media = message.bridgeMedia;
    const renderMedia = (id: string, index: number) => {
      const item = media.items.find((item) => item.id === id);
      return item?.kind === 'audio' ? (
        <BridgeAudio
          key={index}
          channelId={channelId}
          sourceEventId={message.bridgeOrigin!.sourceEventId}
          attachmentId={id}
          name={item.name}
          sizeBytes={item.sizeBytes}
          t={t}
        />
      ) : item?.kind === 'file' ? (
        <BridgeFile
          key={index}
          channelId={channelId}
          sourceEventId={message.bridgeOrigin!.sourceEventId}
          attachmentId={id}
          name={item.name}
          sizeBytes={item.sizeBytes}
          t={t}
        />
      ) : item ? (
        <BridgeImage
          key={index}
          channelId={channelId}
          sourceEventId={message.bridgeOrigin!.sourceEventId}
          attachmentId={id}
          name={item.name}
          t={t}
        />
      ) : null;
    };
    return (
      <div className="bh-bubble-content bh-bridge-media-content">
        {media.voice ? (
          <div className="bh-external-message-head">
            <Tag tone={media.voice.transcript === 'platform' ? 'info' : 'warning'}>
              {t(
                media.voice.transcript === 'platform'
                  ? 'im.voiceTranscriptPlatform'
                  : 'im.voiceTranscriptUnavailable',
              )}
            </Tag>
          </div>
        ) : null}
        {media.parts ? (
          media.parts.map((part, index) =>
            part.kind === 'text' ? (
              <span key={index} className="bh-bubble-body">
                <ExternalMessageText
                  text={part.text}
                  mentions={message.bridgeOrigin!.mentions ?? []}
                  chip
                />
              </span>
            ) : (
              renderMedia(part.id, index)
            ),
          )
        ) : (
          <>
            {message.body ? (
              <div className="bh-bubble-body">
                <ExternalMessageText
                  text={message.body}
                  mentions={message.bridgeOrigin!.mentions ?? []}
                  chip
                />
              </div>
            ) : null}
            {media.items.map((item, index) => renderMedia(item.id, index))}
          </>
        )}
      </div>
    );
  }
  const leading = format === 'markdown' ? leadingBotMentions(message) : undefined;
  const renderMention = (
    mention:
      | NonNullable<ChannelMessage['mentions']>[number]
      | NonNullable<ChannelMessage['humanMentions']>[number],
    key: number,
  ) => {
    const label = currentMentionLabel(mention, bots, humanMembers);
    if ('humanId' in mention)
      return (
        <span
          key={key}
          className="bh-inline-mention bh-inline-mention-sent"
          data-human-id={mention.humanId}
          title={t('message.mention.humanType')}
        >
          @{label}
        </span>
      );
    const bot = bots.find((candidate) => candidate.slug === mention.botSlug);
    const badge = (
      <>
        <span className="bh-inline-mention-avatar" aria-hidden="true">
          <PersonaBotAvatar
            personaBotId={mention.botSlug}
            name={bot?.displayName ?? mention.label}
            src={bot?.avatar}
            appearance={bot?.appearance}
            avatarSeed={bot?.avatarSeed}
            size={16}
            indicator={false}
            t={t}
          />
        </span>
        <span ref={(element) => paintBotName(element, botNameSource(bot))}>{label}</span>
      </>
    );
    if (actions === undefined)
      return (
        <span
          key={key}
          className="bh-inline-mention bh-inline-mention-sent"
          data-bot-id={mention.botSlug}
          title={t('message.mention.botType')}
        >
          {badge}
        </span>
      );
    return (
      <button
        key={key}
        type="button"
        className="bh-inline-mention bh-inline-mention-sent bh-inline-mention-link"
        data-bot-id={mention.botSlug}
        aria-label={t('message.mention.openDm', { bot: label })}
        onClick={() => void actions.openBot(mention.botSlug)}
      >
        {badge}
      </button>
    );
  };
  const renderChannelRef = (
    ref: NonNullable<ChannelMessage['channelRefs']>[number],
    key: number,
  ) => {
    const badge = <span>#{ref.label}</span>;
    if (
      actions === undefined ||
      !store.getSnapshot().channels.some((channel) => channel.id === ref.channelId)
    )
      return (
        <span key={key} className="bh-inline-mention bh-inline-mention-sent">
          {badge}
        </span>
      );
    return (
      <button
        key={key}
        type="button"
        className="bh-inline-mention bh-inline-mention-sent bh-inline-mention-link"
        data-channel-id={ref.channelId}
        aria-label={`Open channel ${ref.label}`}
        onClick={() => void actions.openChannel(ref.channelId)}
      >
        {badge}
      </button>
    );
  };
  const attachedFiles = messageAttachmentReferences(message.attachments ?? []);
  const renderAttachmentText = (text: string) =>
    attachmentReferenceRuns(text, attachedFiles).map((part, index) => {
      const item = part.attachment;
      if (item === undefined) return <span key={index}>{part.text}</span>;
      return (
        <button
          key={index}
          type="button"
          className="bh-inline-mention bh-composer-inline-attachment"
          aria-label={t('composer.locateAttachment', { name: item.file.name })}
          onClick={(event) => {
            const attachmentIndex = attachedFiles.findIndex(
              (candidate) => candidate.id === item.id,
            );
            const card = event.currentTarget
              .closest('.bh-bubble-content')
              ?.querySelector('.bh-message-attachments')?.children[attachmentIndex];
            card?.scrollIntoView({ block: 'nearest' });
            card?.querySelector<HTMLElement>('button, a')?.focus();
          }}
        >
          <span className="bh-attachment-ordinal">{attachedFiles.indexOf(item) + 1}</span>
          <FileTypeIcon path={item.file.name} size={16} />
          <span className="bh-composer-inline-attachment-name">{item.file.name}</span>
          <span className="bh-composer-inline-attachment-size">{fileSizeText(item.file.size)}</span>
        </button>
      );
    });
  return (
    <div className="bh-bubble-content">
      {message.body.length === 0 ? null : format === 'text' ? (
        <div className="bh-bubble-body">
          {referenceRuns(
            message.body,
            message.mentions ?? [],
            message.channelRefs ?? [],
            message.humanMentions ?? [],
          ).map((run, index) =>
            run.mention !== undefined ? (
              renderMention(run.mention, index)
            ) : run.humanMention !== undefined ? (
              renderMention(run.humanMention, index)
            ) : run.channelRef !== undefined ? (
              renderChannelRef(run.channelRef, index)
            ) : (
              <span key={index}>
                {message.author.kind === 'bridged' ? (
                  <ExternalMessageText
                    chip
                    text={run.text}
                    mentions={message.bridgeOrigin?.mentions ?? []}
                  />
                ) : (
                  renderAttachmentText(run.text)
                )}
              </span>
            ),
          )}
        </div>
      ) : (
        <div
          className={`bh-bubble-body bh-bubble-body-markdown${leading === undefined ? '' : ' bh-bubble-body-bot-mentions'}`}
        >
          {leading === undefined ? null : (
            <span className="bh-bot-mention-prefix">
              {leading.mentions.map((mention, index) => renderMention(mention, index))}
              {leading.text.length > 0 ? ' ' : null}
            </span>
          )}
          {leading === undefined || leading.text.length > 0 ? (
            <ChannelMarkdownText
              text={
                humanMarkdown
                  ? preserveHumanLineBreaks(leading?.text ?? message.body)
                  : (leading?.text ?? message.body)
              }
              streaming={message.streaming === true}
              labels={labels}
            />
          ) : null}
        </div>
      )}
      {message.attachments?.length ? (
        <div className="bh-message-attachments">
          {message.attachments.map((ref, index) => (
            <MessageAttachment
              key={`${ref.fileId ?? ref.hash}-${index}`}
              attachment={ref}
              channelId={channelId}
              messageId={message.id}
              actions={actions}
              t={t}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
