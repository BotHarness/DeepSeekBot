import { useRef, useState, type ReactElement, type CSSProperties } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { CompanionRequest } from '../../../core/src/companions/feed.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { ToolApprovalCard } from './tool-approval-card.js';
import { UserQuestionCard } from './user-question-card.js';
import { useMountedResource } from './mounted-resource.js';
import { companionSurface } from './companion-surface.js';
import { hooked } from './ds/hooked.js';
import { color, radius, space } from './ds/tokens.stylex.js';

const styles = stylex.create({
  pending: {
    zIndex: 3,
  },
  header: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    paddingTop: space.x3,
    paddingInline: space.x4,
    paddingBottom: 0,
  },
  source: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  nav: {
    display: 'inline-flex',
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'center',
    gap: space.x1,
  },
  step: {
    width: '20px',
    height: '20px',
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.round,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.fg,
    cursor: 'pointer',
  },
  list: {
    margin: 0,
    paddingTop: space.x2,
    paddingInline: space.x4,
    paddingBottom: space.x4,
    listStyle: 'none',
    overflow: 'auto',
    scrollbarWidth: 'thin',
  },
});

function PendingRequest({
  request,
  actions,
  live,
  t,
  onReleaseFocus,
}: {
  request: CompanionRequest;
  actions: BridgeActions | undefined;
  live: boolean;
  t: BotHarnessTranslate;
  onReleaseFocus(): void;
}): ReactElement {
  const companionTarget = {
    channelId: request.channelId,
    botSlug: request.botSlug,
    sessionId: request.sessionId,
    live,
  };
  const release = useRef(onReleaseFocus);
  const ownedFocus = useRef(false);
  release.current = onReleaseFocus;
  const mounted = useMountedResource<HTMLLIElement>(
    (node) => () => {
      if (
        node.contains(document.activeElement) ||
        (ownedFocus.current && document.activeElement === document.body)
      )
        queueMicrotask(() => {
          if (document.activeElement === document.body || node.contains(document.activeElement))
            release.current();
        });
    },
    [request.messageId],
  );
  return (
    <li
      ref={mounted}
      onFocusCapture={() => {
        ownedFocus.current = true;
      }}
      onBlurCapture={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          ownedFocus.current = false;
      }}
    >
      {actions && request.kind === 'tool-approval' ? (
        <ToolApprovalCard
          message={{
            id: request.messageId,
            at: request.expiresAt,
            author: { kind: 'bot', slug: request.botSlug },
            body: '',
            toolApprovalRequest: request,
          }}
          channelId={request.channelId}
          actions={actions}
          t={t}
          companionTarget={{
            ...companionTarget,
            callId: request.callId,
          }}
        />
      ) : actions && request.kind === 'user-question' ? (
        <UserQuestionCard
          message={{
            id: request.messageId,
            at: '',
            author: { kind: 'bot', slug: request.botSlug },
            body: '',
            userQuestionRequest: request,
          }}
          channelId={request.channelId}
          actions={actions}
          t={t}
          companionTarget={companionTarget}
        />
      ) : null}
    </li>
  );
}

export function CompanionRequests({
  requests,
  actions,
  live,
  t,
  style,
  restoreFocus,
  messageCount,
}: {
  requests: readonly CompanionRequest[];
  actions: BridgeActions | undefined;
  live: boolean;
  t: BotHarnessTranslate;
  style: CSSProperties;
  restoreFocus(): void;
  messageCount: number;
}): ReactElement {
  const root = useRef<HTMLElement>(null);
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const found = requests.findIndex((request) => request.messageId === chosen);
  const index = found < 0 ? 0 : found;
  const request = requests[index]!;
  const release = (): void => {
    const next =
      root.current?.querySelector<HTMLElement>(
        'li button:not(:disabled), li input:not(:disabled)',
      ) ?? root.current?.querySelector<HTMLElement>('ol');
    if (next?.isConnected) next.focus();
    else restoreFocus();
  };
  const step = (offset: number): void =>
    setChosen(requests[(index + offset + requests.length) % requests.length]!.messageId);
  return (
    <section
      ref={root}
      {...hooked('bh-companion-pending', companionSurface.speech, styles.pending)}
      aria-label={t('companion.requests')}
      style={style}
    >
      <header {...stylex.props(companionSurface.header, companionSurface.label, styles.header)}>
        <span {...stylex.props(styles.source)}>
          {t(request.channelId.startsWith('dm-') ? 'companion.source' : 'companion.sourceGroup', {
            name: request.channelName,
          })}
        </span>
        {messageCount ? (
          <span
            {...hooked('bh-companion-queue', companionSurface.label, companionSurface.queue)}
            title={t('companion.messagesWaiting', { count: messageCount })}
            aria-label={t('companion.messagesWaiting', { count: messageCount })}
          >
            +{messageCount}
          </span>
        ) : null}
        {requests.length > 1 ? (
          <span {...stylex.props(styles.nav)}>
            <button
              type="button"
              {...stylex.props(styles.step)}
              aria-label={t('companion.previousRequest')}
              onClick={() => step(-1)}
            >
              ‹
            </button>
            <span
              aria-label={t('companion.requestPosition', {
                index: index + 1,
                count: requests.length,
              })}
            >
              {index + 1}/{requests.length}
            </span>
            <button
              type="button"
              {...stylex.props(styles.step)}
              aria-label={t('companion.nextRequest')}
              onClick={() => step(1)}
            >
              ›
            </button>
          </span>
        ) : null}
      </header>
      <ol tabIndex={-1} {...stylex.props(styles.list)}>
        <PendingRequest
          key={request.messageId}
          request={request}
          actions={actions}
          live={live}
          t={t}
          onReleaseFocus={release}
        />
      </ol>
    </section>
  );
}
