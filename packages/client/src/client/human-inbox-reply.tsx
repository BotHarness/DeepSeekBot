import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { useRef, useState, type ReactElement } from 'react';

import type { BridgeActions } from './actions.js';
import type { TimelinePage } from './bridge.js';
import {
  HumanInboxDismiss,
  HumanInboxContextEdge,
  HumanInboxMessageSource,
} from './human-inbox-detail-controls.js';
import { ChannelMessageBody } from './channel-message-body.js';
import { PersonaBotAvatar } from './avatar.js';
import { channelHumanName, currentMentionLabel, humanLabel } from './actor-names.js';
import type { ChannelHumanMember } from './store.js';
import { referenceRuns } from './channel-refs.js';
import type { BotHarnessTranslate } from './locale.js';
import { toolApprovalReplyPreview } from './approval-text.js';
import { useMountedResource } from './mounted-resource.js';
import type { BotSummary, ChannelAuthor, ChannelMessage, HumanAttentionItem } from './store.js';

export function HumanInboxReply({
  source,
  actions,
  t,
  botName,
  bots,
  humanMembers = [],
  onClose,
  contextOnly = false,
}: {
  contextOnly?: boolean;
  source: HumanAttentionItem;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  botName: (slug: string) => string;
  bots: readonly BotSummary[];
  humanMembers?: readonly ChannelHumanMember[];
  onClose: () => void;
}): ReactElement {
  const isApproval = source.kind === 'tool-approval';
  const isQuestion = source.kind === 'user-question';
  const isGrant = source.kind === 'workspace-grant-request';
  const isNativeAction = isApproval || isQuestion || isGrant;
  const title = t(
    isApproval
      ? 'humanInbox.approval.title'
      : isQuestion
        ? 'humanInbox.question.title'
        : isGrant
          ? 'humanInbox.grant.title'
          : 'humanInbox.reply.title',
    { channel: isNativeAction ? botName(source.botSlug) : (source.channelName ?? '') },
  );
  const channelId = source.channelId!;
  const messageId = source.messageId!;
  const [context, setContext] = useState<ChannelMessage[]>();
  const [response, setResponse] = useState<ChannelMessage>();
  const [contextError, setContextError] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [sent, setSent] = useState<ChannelMessage>();
  const [page, setPage] = useState<TimelinePage>();
  const [olderShown, setOlderShown] = useState(contextOnly ? 2 : 0);
  const [newerShown, setNewerShown] = useState(contextOnly ? 2 : 0);
  const [edgeBusy, setEdgeBusy] = useState<'older' | 'newer'>();
  const [edgeError, setEdgeError] = useState(false);
  const edgePending = useRef(false);
  const loading = useRef<AbortController>();
  const attempt = useRef<{ body: string; id: string }>();
  const submitting = useRef(false);
  const readMessages = useRef(new Set<string>());

  const reload = async (): Promise<void> => {
    loading.current?.abort();
    const controller = new AbortController();
    loading.current = controller;
    setContext(undefined);
    setContextError(false);
    try {
      const initial = await actions.humanInboxContextPage(
        channelId,
        { direction: 'around', around: messageId, olderLimit: 2, newerLimit: 2 },
        controller.signal,
      );
      const messages = initial.entries;
      const responseId = source.category === 'handled' ? source.responseMessageId : undefined;
      const responses =
        responseId === undefined
          ? []
          : await actions.humanInboxContext(channelId, responseId, controller.signal);
      const answer = responses.find(
        (message) =>
          message.id === responseId &&
          message.author.kind === 'human' &&
          message.replyTo === messageId,
      );
      if (responseId !== undefined && answer === undefined)
        throw new Error('Canonical response is unavailable');
      if (!controller.signal.aborted) {
        setContext(messages);
        setPage(initial);
        setResponse(answer);
      }
    } catch {
      if (!controller.signal.aborted) setContextError(true);
    }
  };
  const mount = useMountedResource<HTMLElement>(() => {
    void reload();
    return () => loading.current?.abort();
  }, [actions, channelId, messageId, source.category, source.responseMessageId]);
  const visibleSource = useMountedResource<HTMLDivElement>(
    (element) => {
      if (typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const visibleId = entry.target.getAttribute('data-message-id');
            if (
              !entry.isIntersecting ||
              entry.intersectionRatio < 0.5 ||
              visibleId === null ||
              readMessages.current.has(visibleId)
            )
              continue;
            readMessages.current.add(visibleId);
            void actions.markRead(channelId, visibleId).catch(() => {
              readMessages.current.delete(visibleId);
            });
          }
        },
        { threshold: 0.5 },
      );
      for (const message of element.querySelectorAll('[data-message-id]'))
        observer.observe(message);
      return () => observer.disconnect();
    },
    [actions, channelId, messageId, context, olderShown, newerShown],
  );
  const submit = async (): Promise<void> => {
    const body = draft.trim();
    if (submitting.current || body.length === 0 || context === undefined || contextError) return;
    submitting.current = true;
    setSending(true);
    setSendError(false);
    if (attempt.current?.body !== body)
      attempt.current = { body, id: 'human-' + crypto.randomUUID() };
    try {
      const reply = await actions.replyFromHumanInbox(
        channelId,
        messageId,
        body,
        attempt.current.id,
      );
      setSent(reply);
      setDraft('');
      void actions.refreshHumanInbox().catch(() => undefined);
    } catch {
      setSendError(true);
    } finally {
      submitting.current = false;
      setSending(false);
    }
  };
  const authorName = (value: ChannelAuthor): string =>
    value.kind === 'bot'
      ? botName(value.slug)
      : value.kind === 'bridged'
        ? value.source
        : value.kind === 'human'
          ? humanLabel(channelHumanName({ humanMembers: [...humanMembers] }), t)
          : t('humanInbox.reply.system');
  const author = (message: ChannelMessage): string => authorName(message.author);
  const target = context?.find((message) => message.id === messageId);
  const targetIndex = context?.findIndex((message) => message.id === messageId) ?? -1;
  const visibleMessages =
    context?.slice(Math.max(0, targetIndex - olderShown), targetIndex + newerShown + 1) ?? [];
  const hasOlder = targetIndex > olderShown || page?.hasOlder === true;
  const expand = async (direction: 'older' | 'newer'): Promise<void> => {
    if (edgePending.current || context === undefined || page === undefined) return;
    setEdgeError(false);
    if (direction === 'older' && targetIndex > olderShown) {
      setOlderShown(targetIndex);
      return;
    }
    if (direction === 'newer' && context.length > targetIndex + newerShown + 1) {
      setNewerShown(context.length - targetIndex - 1);
      return;
    }
    const cursor = direction === 'older' ? page.olderCursor : page.newerCursor;

    edgePending.current = true;
    setEdgeBusy(direction);
    loading.current?.abort();
    const controller = new AbortController();
    loading.current = controller;
    try {
      const next = await actions.humanInboxContextPage(
        channelId,
        cursor === null
          ? { direction: 'around', around: context.at(-1)!.id, olderLimit: 0, newerLimit: 10 }
          : { direction, cursor, limit: 10 },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const additions = next.entries.filter(
        (message) => !context.some((current) => current.id === message.id),
      );
      setContext(direction === 'older' ? [...additions, ...context] : [...context, ...additions]);
      setPage(
        direction === 'older'
          ? { ...page, olderCursor: next.olderCursor, hasOlder: next.hasOlder }
          : { ...page, newerCursor: next.newerCursor, hasNewer: next.hasNewer },
      );
      if (direction === 'older') setOlderShown(olderShown + additions.length);
      else setNewerShown(newerShown + additions.length);
    } catch {
      if (!controller.signal.aborted) setEdgeError(true);
    } finally {
      edgePending.current = false;
      if (!controller.signal.aborted) setEdgeBusy(undefined);
    }
  };
  const openSource = (id: string): void => {
    void actions.openChannelAtMessage(channelId, id).catch(() => {
      setContext(undefined);
      setContextError(true);
    });
  };

  return (
    <section className="bh-human-inbox-reply" ref={mount} aria-label={title}>
      <div className="bh-human-inbox-reply-header">
        <h2>{title}</h2>
        {contextOnly ? (
          <Button size="sm" onClick={onClose}>
            {t('common.close')}
          </Button>
        ) : (
          <HumanInboxDismiss
            source={source}
            actions={actions}
            t={t}
            disabled={sending}
            onClose={onClose}
          />
        )}
      </div>
      {target === undefined ? (
        <p role={contextError ? 'alert' : 'status'}>
          {t(contextError ? 'humanInbox.reply.unavailable' : 'humanInbox.loading')}
          {contextError ? (
            <Button size="sm" type="button" onClick={() => void reload()}>
              {t('humanInbox.context.retry')}
            </Button>
          ) : null}
        </p>
      ) : (
        <div>
          <div className="bh-human-inbox-context-window">
            <HumanInboxContextEdge
              direction="older"
              disabled={!hasOlder}
              busy={edgeBusy !== undefined}
              onClick={() => void expand('older')}
              t={t}
            />
            <div ref={visibleSource} className="bh-human-inbox-message-flow">
              {visibleMessages.map((message) => (
                <article
                  key={message.id}
                  data-message-id={message.id}
                  className={
                    'bh-human-inbox-message' +
                    (message.id === messageId ? ' bh-human-inbox-reply-source' : '')
                  }
                >
                  <HumanInboxMessageSource
                    label={t('humanInbox.open')}
                    onClick={() => openSource(message.id)}
                  />
                  {message.author.kind === 'bot' ? (
                    <PersonaBotAvatar
                      personaBotId={message.author.slug}
                      name={author(message)}
                      src={
                        bots.find(
                          (bot) =>
                            message.author.kind === 'bot' && bot.slug === message.author.slug,
                        )?.avatar
                      }
                      appearance={
                        bots.find(
                          (bot) =>
                            message.author.kind === 'bot' && bot.slug === message.author.slug,
                        )?.appearance
                      }
                      avatarSeed={
                        bots.find(
                          (bot) =>
                            message.author.kind === 'bot' && bot.slug === message.author.slug,
                        )?.avatarSeed
                      }
                      size={28}
                      indicator={false}
                      t={t}
                    />
                  ) : (
                    <span className="bh-human-inbox-human-avatar" aria-hidden="true">
                      {author(message).slice(0, 1)}
                    </span>
                  )}
                  <div className="bh-human-inbox-message-content">
                    <div className="bh-human-inbox-message-heading">
                      <strong>{author(message)}</strong>
                      <time dateTime={message.at}>{new Date(message.at).toLocaleString()}</time>
                    </div>
                    {message.id === messageId ? (
                      <span className="bh-human-inbox-message-target">
                        {t(
                          isApproval
                            ? 'approval.requestTitle'
                            : isQuestion
                              ? 'question.title'
                              : isGrant
                                ? 'grant.requestTitle'
                                : 'humanInbox.reply.target',
                        )}
                      </span>
                    ) : null}
                    {message.replyToPreview ? (
                      <blockquote>
                        <strong>{authorName(message.replyToPreview.author)}</strong>
                        <p>{toolApprovalReplyPreview(message, message.replyToPreview.body, t)}</p>
                      </blockquote>
                    ) : null}
                    {isNativeAction && message.id === messageId && !contextOnly ? (
                      <ChannelMessageBody
                        message={message}
                        channelId={channelId}
                        actions={actions}
                        t={t}
                        userQuestionResolution={
                          response?.userQuestionResolution?.state ??
                          message.userQuestionResolution?.state ??
                          context?.find(
                            (entry) => entry.userQuestionResolution?.requestMessageId === messageId,
                          )?.userQuestionResolution?.state
                        }
                        toolApprovalDecision={
                          response?.toolApprovalDecision?.outcome ??
                          context?.find(
                            (entry) => entry.toolApprovalDecision?.requestMessageId === messageId,
                          )?.toolApprovalDecision?.outcome
                        }
                      />
                    ) : (
                      <p>
                        {referenceRuns(
                          message.body,
                          message.mentions ?? [],
                          [],
                          message.humanMentions ?? [],
                        ).map((run, index) =>
                          run.humanMention === undefined && run.mention === undefined ? (
                            <span key={index}>{run.text}</span>
                          ) : (
                            <span
                              key={index}
                              className="bh-inline-mention bh-inline-mention-sent"
                              data-human-id={run.humanMention?.humanId}
                              data-bot-id={run.mention?.botSlug}
                              title={t(
                                run.humanMention === undefined
                                  ? 'message.mention.botType'
                                  : 'message.mention.humanType',
                              )}
                            >
                              @
                              {currentMentionLabel(
                                (run.humanMention ?? run.mention)!,
                                bots,
                                humanMembers,
                              )}
                            </span>
                          ),
                        )}
                      </p>
                    )}
                    {message.attachments?.map((attachment) => (
                      <p key={attachment.fileId ?? attachment.hash}>{attachment.name}</p>
                    ))}
                  </div>
                </article>
              ))}
              {response === undefined ||
              visibleMessages.some((message) => message.id === response.id) ? null : (
                <article data-message-id={response.id} className="bh-human-inbox-message">
                  <HumanInboxMessageSource
                    label={t('humanInbox.handled.response')}
                    onClick={() => openSource(response.id)}
                  />
                  <span className="bh-human-inbox-human-avatar" aria-hidden="true">
                    {author(response).slice(0, 1)}
                  </span>
                  <div className="bh-human-inbox-message-content">
                    <div className="bh-human-inbox-message-heading">
                      <strong>{author(response)}</strong>
                      <time dateTime={response.at}>{new Date(response.at).toLocaleString()}</time>
                    </div>
                    <p>{response.body}</p>
                  </div>
                </article>
              )}
            </div>
            <HumanInboxContextEdge
              direction="newer"
              disabled={false}
              busy={edgeBusy !== undefined}
              onClick={() => void expand('newer')}
              t={t}
            />
          </div>
          {edgeError ? <p role="alert">{t('humanInbox.reply.unavailable')}</p> : null}
        </div>
      )}
      {isNativeAction ? null : sent === undefined ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label>
            <span>{t('humanInbox.reply.input')}</span>
            <textarea
              value={draft}
              rows={3}
              disabled={sending}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
          </label>
          {sendError ? <p role="alert">{t('humanInbox.reply.failed')}</p> : null}
          <div className="bh-human-inbox-reply-actions">
            <Button
              size="sm"
              variant="primary"
              type="submit"
              disabled={
                sending || context === undefined || contextError || draft.trim().length === 0
              }
            >
              {t(sending ? 'humanInbox.reply.sending' : 'humanInbox.reply.send')}
            </Button>
          </div>
        </form>
      ) : (
        <div role="status">
          <strong>{t('humanInbox.reply.sent')}</strong>
          <p>{sent.body}</p>
          <Button size="sm" variant="outline" type="button" onClick={() => openSource(sent.id)}>
            {t('humanInbox.open')}
          </Button>
        </div>
      )}
    </section>
  );
}
