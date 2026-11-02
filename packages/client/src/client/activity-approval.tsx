import { useState, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import { PersonaBotAvatar } from './avatar.js';
import { ToolApprovalCard } from './tool-approval-card.js';
import { HumanInboxReply } from './human-inbox-reply.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import type { BotSummary, ChannelMessage, HumanAttentionItem } from './store.js';

export function ActivityApproval({
  source,
  actions,
  bots,
  t,
  leaving,
  onFocus,
}: {
  source: HumanAttentionItem;
  actions: BridgeActions;
  bots: readonly BotSummary[];
  t: BotHarnessTranslate;
  leaving: boolean;
  onFocus: () => void;
}): ReactElement {
  const [message, setMessage] = useState<ChannelMessage>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [context, setContext] = useState(false);
  const bot = bots.find((value) => value.slug === source.botSlug);
  const name = bot?.displayName ?? source.botSlug;
  const mount = useMountedResource<HTMLElement>(() => {
    const controller = new AbortController();
    setFailed(false);
    void actions
      .humanInboxContextPage(
        source.channelId!,
        {
          direction: 'around',
          around: source.messageId!,
          olderLimit: 0,
          newerLimit: 0,
        },
        controller.signal,
      )
      .then(
        (page) => {
          if (controller.signal.aborted) return;
          const value = page.entries.find((entry) => entry.id === source.messageId);
          if (
            !value?.toolApprovalRequest ||
            value.author.kind !== 'bot' ||
            value.author.slug !== source.botSlug
          ) {
            setFailed(true);
            return;
          }
          setMessage(value);
        },
        () => {
          if (!controller.signal.aborted) setFailed(true);
        },
      );
    return () => controller.abort();
  }, [actions, source.channelId, source.messageId, source.botSlug, attempt]);
  const exitMount = useMountedResource<HTMLDivElement>(
    (node) => {
      if (leaving && node.contains(document.activeElement))
        node.closest<HTMLElement>('[role="list"]')?.focus({ preventScroll: true });
      if (leaving) node.setAttribute('inert', '');
      else node.removeAttribute('inert');
    },
    [leaving],
  );
  return (
    <article
      ref={mount}
      role="listitem"
      className="bh-activity-approval"
      data-attention-id={source.id}
      data-leaving={leaving || undefined}
    >
      <div ref={exitMount} className="bh-activity-approval-clip">
        <div className="bh-activity-approval-content">
          <div className="bh-activity-approval-heading">
            <PersonaBotAvatar
              personaBotId={source.botSlug}
              name={name}
              src={bot?.avatar}
              appearance={bot?.appearance}
              avatarSeed={bot?.avatarSeed}
              size={28}
              indicator={false}
              t={t}
            />
            <div>
              <strong>{name}</strong>
              <span>
                {source.channelId?.startsWith('dm-') ? t('identity.kind.dm') : source.channelName}
              </span>
            </div>
            <time dateTime={source.createdAt}>
              {new Date(source.createdAt).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </div>
          {message ? (
            <ToolApprovalCard
              message={message}
              channelId={source.channelId}
              actions={actions}
              t={t}
              surface="activity"
            />
          ) : (
            <div role={failed ? 'alert' : 'status'} className="bh-note">
              {t(failed ? 'activityInbox.unavailable' : 'humanInbox.loading')}
              {failed ? (
                <Button size="sm" onClick={() => setAttempt((value) => value + 1)}>
                  {t('humanInbox.context.retry')}
                </Button>
              ) : null}
            </div>
          )}
          <div className="bh-activity-approval-footer">
            <button
              type="button"
              className="bh-request-link bh-activity-context-toggle"
              aria-expanded={context}
              onFocus={onFocus}
              onClick={() => setContext(!context)}
            >
              {t(context ? 'activityInbox.hideContext' : 'activityInbox.context')}
            </button>
            <button
              type="button"
              className="bh-request-link"
              onClick={() => {
                void actions
                  .openChannelAtMessage(source.channelId!, source.messageId!)
                  .catch(() => setFailed(true));
              }}
            >
              {t('humanInbox.open')}
            </button>
          </div>
          {failed && message ? <p role="alert">{t('humanInbox.failed')}</p> : null}
          {context ? (
            <HumanInboxReply
              source={source}
              actions={actions}
              t={t}
              bots={bots}
              botName={(slug) => bots.find((value) => value.slug === slug)?.displayName ?? slug}
              onClose={() => setContext(false)}
              contextOnly
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function useActivityRows(
  items: readonly HumanAttentionItem[],
  scope: string,
  enabled: boolean,
) {
  const [state, setState] = useState(() => ({
    items,
    scope,
    rows: items.map((item) => ({ item, leaving: false })),
  }));
  let rows = state.rows;
  if (state.items !== items || state.scope !== scope) {
    const currentIds = new Set(items.map((item) => item.id));
    rows = items.map((item) => ({ item, leaving: false }));
    if (enabled && state.scope === scope) {
      state.rows.forEach((row, index) => {
        if (!currentIds.has(row.item.id) && row.item.kind === 'tool-approval')
          rows.splice(Math.min(index, rows.length), 0, { ...row, leaving: true });
      });
    }
    setState({ items, scope, rows });
  }
  const mount = useMountedResource<HTMLDivElement>(() => {
    if (!rows.some((row) => row.leaving)) return;
    const timer = setTimeout(
      () =>
        setState((current) => ({ ...current, rows: current.rows.filter((row) => !row.leaving) })),
      220,
    );
    return () => clearTimeout(timer);
  }, [rows]);
  return { rows, mount };
}
