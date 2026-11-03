import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react';

import type {
  TakeoverOutcome,
  TakeoverResolution,
  TakeoverTarget,
} from '../../../core/src/takeover/contracts.js';
import type { BridgeActions } from './actions.js';
import { ActionButton } from './ds/action-button.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ChannelMessage } from './store.js';

export const TakeoverTimeline = createContext<
  | {
      resolutions: ReadonlyMap<string, TakeoverResolution>;
      open(target: TakeoverTarget, botSlug: string): boolean;
    }
  | undefined
>(undefined);

export const TAKEOVER_PANELS: Readonly<Record<TakeoverTarget, string>> = {
  computer: 'botharness-computer',
  browser: 'botharness-browser',
};

function subscribeMinute(listener: () => void): () => void {
  const timer = setInterval(listener, 30_000);
  return () => clearInterval(timer);
}

function minuteNow(): number {
  return Math.floor(Date.now() / 30_000) * 30_000;
}

export function takeoverStatus(
  message: Pick<ChannelMessage, 'takeoverRequest'>,
  resolution: Pick<TakeoverResolution, 'outcome'> | undefined,
  now: number,
): 'pending' | TakeoverOutcome {
  if (resolution !== undefined) return resolution.outcome;
  const expires = Date.parse(message.takeoverRequest?.expiresAt ?? '');
  return Number.isFinite(expires) && expires <= now ? 'expired' : 'pending';
}

export function takeoverResolutions(
  messages: readonly Pick<ChannelMessage, 'takeoverResolution'>[],
): ReadonlyMap<string, TakeoverResolution> {
  const resolutions = new Map<string, TakeoverResolution>();
  for (const message of messages)
    if (message.takeoverResolution !== undefined)
      resolutions.set(message.takeoverResolution.requestMessageId, message.takeoverResolution);
  return resolutions;
}

export function TakeoverCard({
  message,
  channelId,
  actions,
  t,
}: {
  message: ChannelMessage;
  channelId: string | undefined;
  actions: Pick<BridgeActions, 'settleTakeover'>;
  t: BotHarnessTranslate;
}): ReactElement {
  const request = message.takeoverRequest!;
  const timeline = useContext(TakeoverTimeline);
  const resolution = timeline?.resolutions.get(message.id);
  const now = useSyncExternalStore(subscribeMinute, minuteNow, minuteNow);
  const [busy, setBusy] = useState<'done' | 'failed' | 'cancelled'>();
  const [settled, setSettled] = useState<TakeoverOutcome>();
  const [error, setError] = useState<string>();
  const [unavailable, setUnavailable] = useState(false);
  const botSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
  const status = settled ?? takeoverStatus(message, resolution, now);
  const pending = status === 'pending';
  const settle = (outcome: 'done' | 'failed' | 'cancelled'): void => {
    if (channelId === undefined || busy !== undefined || actions.settleTakeover === undefined)
      return;
    setBusy(outcome);
    setError(undefined);
    void actions
      .settleTakeover(channelId, message.id, outcome)
      .then(
        (recorded) => setSettled(recorded ?? outcome),
        (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setBusy(undefined));
  };
  const open = (): void => {
    if (botSlug === undefined) return;
    setUnavailable(timeline?.open(request.target, botSlug) !== true);
  };
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
