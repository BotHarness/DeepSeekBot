import { ActionButton } from './ds/action-button.js';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { useRef, useState, type ReactElement } from 'react';
import type { BridgeActions } from './actions.js';
import type { HumanAssignmentContext } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import type { HumanAttentionItem } from './store.js';
import type { BotSummary } from './store.js';
import {
  HumanInboxDismiss,
  HumanInboxContextEdge,
  HumanInboxMessageSource,
} from './human-inbox-detail-controls.js';
import { PersonaBotAvatar } from './avatar.js';
import { useMountedResource } from './mounted-resource.js';

export function HumanInboxAssignment({
  source,
  actions,
  t,
  botName,
  bots = [],
  onClose,
}: {
  source: HumanAttentionItem;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  botName: (slug: string) => string;
  bots?: readonly BotSummary[];
  onClose: () => void;
}): ReactElement {
  const sessionId = source.assignmentSessionId!;
  const sourceEventId = source.sourceEventId!;
  const [context, setContext] = useState<HumanAssignmentContext>();
  const [failed, setFailed] = useState(false);
  const [olderShown, setOlderShown] = useState(0);
  const [newerShown, setNewerShown] = useState(0);
  const [edgeBusy, setEdgeBusy] = useState(false);
  const edgePending = useRef(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [navigationError, setNavigationError] = useState(false);
  const [sent, setSent] = useState<HumanAssignmentContext['reply']>();
  const loading = useRef<AbortController>();
  const pending = useRef(false);
  const attempt = useRef<{ body: string; id: string }>();
  const reload = async (): Promise<void> => {
    loading.current?.abort();
    const controller = new AbortController();
    loading.current = controller;
    setFailed(false);
    setContext(undefined);
    try {
      const value = await actions.humanAssignmentContext(
        source.botSlug,
        sessionId,
        sourceEventId,
        controller.signal,
      );
      if (!controller.signal.aborted) setContext(value);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    }
  };
  const mount = useMountedResource<HTMLElement>(() => {
    void reload();
    return () => loading.current?.abort();
  }, [actions, source.botSlug, sessionId, sourceEventId]);
  const submit = async (): Promise<void> => {
    const body = draft.trim();
    if (pending.current || body.length === 0 || context?.canReply !== true) return;
    pending.current = true;
    setSending(true);
    setSendError(false);
    if (attempt.current?.body !== body)
      attempt.current = { body, id: 'human-' + crypto.randomUUID() };
    try {
      const reply = await actions.replyToHumanAssignment(
        source.botSlug,
        sessionId,
        sourceEventId,
        body,
        attempt.current.id,
      );
      setSent(reply);
      setDraft('');
    } catch {
      setSendError(true);
      await reload();
    } finally {
      pending.current = false;
      setSending(false);
    }
  };
  const reply = sent ?? context?.reply;
  const navigate = async (open: () => unknown): Promise<void> => {
    setNavigationError(false);
    try {
      await open();
    } catch {
      setNavigationError(true);
    }
  };
  const target = context?.reports.find((row) => row.sourceEventId === sourceEventId);
  const targetIndex =
    context?.reports.findIndex((report) => report.sourceEventId === sourceEventId) ?? -1;
  const visibleReports =
    context?.reports.slice(Math.max(0, targetIndex - olderShown), targetIndex + newerShown + 1) ??
    [];
  const expand = async (direction: 'older' | 'newer'): Promise<void> => {
    if (edgePending.current || context === undefined) return;
    if (direction === 'older' && targetIndex > olderShown) {
      setOlderShown(targetIndex);
      return;
    }
    if (direction === 'newer' && context.reports.length > targetIndex + newerShown + 1) {
      setNewerShown(context.reports.length - targetIndex - 1);
      return;
    }
    const edge = direction === 'older' ? context.reports[0] : context.reports.at(-1);
    if (edge === undefined) return;
    setFailed(false);
    edgePending.current = true;
    setEdgeBusy(true);
    loading.current?.abort();
    const controller = new AbortController();
    loading.current = controller;
    try {
      const next = await actions.humanAssignmentContext(
        source.botSlug,
        sessionId,
        edge.sourceEventId,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const edgeIndex = next.reports.findIndex(
        (report) => report.sourceEventId === edge.sourceEventId,
      );
      const candidates =
        direction === 'older'
          ? next.reports.slice(0, edgeIndex)
          : next.reports.slice(edgeIndex + 1);
      const additions = candidates.filter(
        (report) =>
          !context.reports.some((current) => current.sourceEventId === report.sourceEventId),
      );
      setContext(
        direction === 'older'
          ? {
              ...context,
              reports: [...additions, ...context.reports],
              hasOlder: next.hasOlder ?? false,
            }
          : {
              ...context,
              reports: [...context.reports, ...additions],
              hasNewer: next.hasNewer ?? false,
            },
      );
      if (direction === 'older') setOlderShown(olderShown + additions.length);
      else setNewerShown(newerShown + additions.length);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      edgePending.current = false;
      if (!controller.signal.aborted) setEdgeBusy(false);
    }
  };
  const title = t('humanInbox.assignment.title', { bot: botName(source.botSlug) });
  return (
    <section className="bh-human-inbox-reply" ref={mount} aria-label={title}>
      <div className="bh-human-inbox-reply-header">
        <h2>{title}</h2>
        <HumanInboxDismiss
          source={source}
          actions={actions}
          t={t}
          disabled={sending}
          onClose={onClose}
        />
      </div>
      {target === undefined ? (
        <p role={failed ? 'alert' : 'status'}>
          {t(failed ? 'humanInbox.reply.unavailable' : 'humanInbox.loading')}
        </p>
      ) : (
        <>
          <h3 className="bh-human-inbox-purpose is-collapsed">{context!.purpose}</h3>
          <div className="bh-human-inbox-context-window">
            <HumanInboxContextEdge
              direction="older"
              disabled={!(targetIndex > olderShown || context?.hasOlder)}
              busy={edgeBusy}
              onClick={() => void expand('older')}
              t={t}
            />
            <div className="bh-human-inbox-message-flow">
              {visibleReports.map((report) => (
                <article
                  key={report.sourceEventId}
                  data-source-event-id={report.sourceEventId}
                  className={
                    'bh-human-inbox-message' +
                    (report.sourceEventId === sourceEventId ? ' bh-human-inbox-reply-source' : '')
                  }
                >
                  <HumanInboxMessageSource
                    label={t('humanInbox.assignment.session')}
                    onClick={() => void navigate(() => actions.openSession(sessionId))}
                  />
                  <PersonaBotAvatar
                    personaBotId={source.botSlug}
                    name={botName(source.botSlug)}
                    src={bots.find((bot) => bot.slug === source.botSlug)?.avatar}
                    appearance={bots.find((bot) => bot.slug === source.botSlug)?.appearance}
                    avatarSeed={bots.find((bot) => bot.slug === source.botSlug)?.avatarSeed}
                    size={28}
                    indicator={false}
                    t={t}
                  />
                  <div className="bh-human-inbox-message-content">
                    <div className="bh-human-inbox-message-heading">
                      <strong>{botName(source.botSlug)}</strong>
                      <time dateTime={report.at}>{new Date(report.at).toLocaleString()}</time>
                    </div>
                    <span className="bh-human-inbox-message-target">
                      {t(`inbox.report.${report.state}`)}
                    </span>
                    <p>{report.summary}</p>
                  </div>
                </article>
              ))}
            </div>
            <HumanInboxContextEdge
              direction="newer"
              disabled={false}
              busy={edgeBusy}
              onClick={() => void expand('newer')}
              t={t}
            />
          </div>
        </>
      )}
      <div className="bh-human-inbox-reply-actions">
        <ActionButton
          size="sm"
          icon="terminal"
          type="button"
          onClick={() => void navigate(() => actions.openSession(sessionId))}
        >
          {t('humanInbox.assignment.session')}
        </ActionButton>
        <ActionButton
          size="sm"
          icon="message-square"
          type="button"
          onClick={() => void navigate(() => actions.openBot(source.botSlug))}
        >
          {t('humanInbox.assignment.dm')}
        </ActionButton>
      </div>
      {failed && target !== undefined ? (
        <p role="alert">{t('humanInbox.reply.unavailable')}</p>
      ) : null}
      {navigationError ? <p role="alert">{t('humanInbox.reply.unavailable')}</p> : null}
      {reply !== undefined && (sent !== undefined || context?.canReply !== true) ? (
        <div role="status">
          <strong>{t('humanInbox.assignment.sent')}</strong>
          <p>{reply.body}</p>
          <p>{t('humanInbox.assignment.forwarding')}</p>
          <ActionButton
            size="sm"
            icon="external-link"
            type="button"
            onClick={() =>
              void navigate(() => actions.openChannelAtMessage('dm-' + source.botSlug, reply.id))
            }
          >
            {t('humanInbox.open')}
          </ActionButton>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {reply !== undefined && context?.canReply === true ? (
            <p role="status">{t('humanInbox.assignment.retry')}</p>
          ) : null}
          {context !== undefined && !context.canReply ? (
            <p role="status">{t('humanInbox.assignment.stale')}</p>
          ) : null}
          <label>
            <span>{t('humanInbox.reply.input')}</span>
            <textarea
              rows={3}
              value={draft}
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
              disabled={sending || context?.canReply !== true || draft.trim().length === 0}
            >
              {t(sending ? 'humanInbox.reply.sending' : 'humanInbox.reply.send')}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
