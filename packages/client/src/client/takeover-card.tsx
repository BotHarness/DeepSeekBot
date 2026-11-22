import { renderTakeoverCard } from './features/takeover/takeover-card-view.js';

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
  return renderTakeoverCard({
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
  });
}
