import type { ReactElement } from 'react';
import { ActionButton } from '../../ds/action-button.js';
import { Tag } from '../../ds/tag.js';
import type { BotHarnessTranslate } from '../../locale.js';
import type { ChannelMessage } from '../../store.js';

type Settlement = 'done' | 'failed' | 'cancelled';

export function renderTakeoverCard({
  request,
  message,
  channelId,
  status,
  busy,
  error,
  unavailable,
  settle,
  open,
  t,
}: {
  request: NonNullable<ChannelMessage['takeoverRequest']>;
  message: ChannelMessage;
  channelId: string | undefined;
  status: 'pending' | NonNullable<ChannelMessage['takeoverResolution']>['outcome'];
  busy: Settlement | undefined;
  error: string | undefined;
  unavailable: boolean;
  settle(outcome: Settlement): void;
  open(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const pending = status === 'pending';
  return (
    <div
      className="bh-question-card bh-takeover-card"
      data-takeover-status={status}
      data-takeover-target={request.target}
    >
      <div className="bh-private-input-heading">
        <div className="bh-grant-request-title">{request.title}</div>
        <span role="status" className="bh-private-input-state">
          <Tag tone={pending ? 'warning' : 'neutral'}>
            {t(pending ? 'takeover.pending' : `takeover.outcome.${status}`)}
          </Tag>
        </span>
      </div>
      <div className="bh-note">{t(`takeover.label.${request.target}`)}</div>
      <div className="bh-question-prompt">{message.body}</div>
      {pending ? (
        <>
          <div className="bh-note">
            {t('takeover.expiresAt', {
              time: new Date(request.expiresAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
            {' · '}
            {t('takeover.note')}
          </div>
          <div className="bh-message-card-actions">
            <ActionButton icon="external-link" tone="primary" size="md" onClick={open}>
              {t('takeover.open')}
            </ActionButton>
            <ActionButton
              icon="check"
              busy={busy === 'done'}
              disabled={busy !== undefined || channelId === undefined}
              onClick={() => settle('done')}
            >
              {t('takeover.done')}
            </ActionButton>
            <ActionButton
              icon="x"
              busy={busy === 'failed'}
              disabled={busy !== undefined || channelId === undefined}
              onClick={() => settle('failed')}
            >
              {t('takeover.failed')}
            </ActionButton>
            <ActionButton
              icon="archive"
              busy={busy === 'cancelled'}
              disabled={busy !== undefined || channelId === undefined}
              onClick={() => settle('cancelled')}
            >
              {t('takeover.cancel')}
            </ActionButton>
          </div>
        </>
      ) : null}
      {unavailable && pending ? (
        <div role="status" className="bh-note">
          {t('takeover.unavailable')}
        </div>
      ) : null}
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
