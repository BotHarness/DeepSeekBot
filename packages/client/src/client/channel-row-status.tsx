import { useSyncExternalStore, type ReactElement } from 'react';
import type { PersonaBotAttention } from '../../../core/src/state/bot-state.js';
import { attentionCount } from './activity-attention.js';
import type { PersonaBotActivityState } from './avatar.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ChannelAuthor } from './store.js';

export type ChannelRowStatus =
  | 'needs-you'
  | 'blocked'
  | 'working'
  | 'paused'
  | 'done-unread'
  | 'done'
  | 'none';

export const DONE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function channelRowStatus(input: {
  activity: PersonaBotActivityState;
  attention?: PersonaBotAttention | undefined;
  paused?: boolean | undefined;
  unread: number;
  botSlug: string;
  latest?: { at: string; author: ChannelAuthor } | undefined;
  now: number;
}): ChannelRowStatus {
  const { activity, attention } = input;
  const blockedOnly =
    (attention?.blockedCount ?? 0) > 0 &&
    attentionCount(attention) === (attention?.blockedCount ?? 0);
  if (activity === 'waiting' || (attentionCount(attention) > 0 && !blockedOnly)) return 'needs-you';
  if (activity === 'blocked' || blockedOnly) return 'blocked';
  if (activity === 'thinking' || activity === 'working') return 'working';
  if (input.paused) return 'paused';
  const latest = input.latest;
  const fromBot = latest?.author.kind === 'bot' && latest.author.slug === input.botSlug;
  if (!fromBot) return 'none';
  if (input.unread > 0) return 'done-unread';
  const at = Date.parse(latest.at);
  return Number.isFinite(at) && input.now - at < DONE_WINDOW_MS ? 'done' : 'none';
}

function statusLabel(status: ChannelRowStatus, t: BotHarnessTranslate): string {
  switch (status) {
    case 'needs-you':
      return t('activity.waiting');
    case 'blocked':
      return t('activity.blocked');
    case 'working':
      return t('activity.working');
    case 'paused':
      return t('roster.status.paused');
    case 'done-unread':
      return t('roster.status.doneUnread');
    case 'done':
      return t('roster.status.done');
    case 'none':
      return '';
  }
}

function glyph(status: Exclude<ChannelRowStatus, 'none'>): ReactElement {
  switch (status) {
    case 'working':
      return (
        <>
          <circle className="bh-row-glyph-track" cx="8" cy="8" r="6.2" />
          <path className="bh-row-glyph-arc" d="M8 1.8a6.2 6.2 0 0 1 6.2 6.2" />
        </>
      );
    case 'needs-you':
      return (
        <>
          <circle className="bh-row-glyph-ring" cx="8" cy="8" r="6.2" />
          <circle className="bh-row-glyph-fill" cx="8" cy="8" r="3" />
        </>
      );
    case 'blocked':
      return (
        <>
          <circle className="bh-row-glyph-fill" cx="8" cy="8" r="7" />
          <path className="bh-row-glyph-cut" d="M8 4.3v4.4" />
          <circle className="bh-row-glyph-dot" cx="8" cy="11.3" r="1.05" />
        </>
      );
    case 'done-unread':
      return (
        <>
          <circle className="bh-row-glyph-fill" cx="8" cy="8" r="7" />
          <path className="bh-row-glyph-cut" d="M5 8.2l2 2 4-4.3" />
        </>
      );
    case 'done':
      return <path className="bh-row-glyph-check" d="M3.5 8.4l3 3 6-6.6" />;
    case 'paused':
      return (
        <path
          className="bh-row-glyph-fill"
          d="M10.8 12.6A5.6 5.6 0 0 1 6.4 2.4a5.6 5.6 0 1 0 6.9 8.1 5.6 5.6 0 0 1-2.5 2.1z"
        />
      );
  }
}

export function ChannelRowStatusGlyph({
  status,
  t,
}: {
  status: ChannelRowStatus;
  t: BotHarnessTranslate;
}): ReactElement | null {
  if (status === 'none') return null;
  return (
    <svg
      className="bh-row-glyph"
      data-status={status}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      role="img"
      aria-label={statusLabel(status, t)}
    >
      {glyph(status)}
    </svg>
  );
}

export function formatChannelListTime(at: number, now: number, t: BotHarnessTranslate): string {
  const locale = t('time.intlLocale');
  const date = new Date(at);
  const today = new Date(now);
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOfDay(today) - startOfDay(date)) / 86_400_000);
  if (days <= 0)
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  if (days === 1) return t('time.yesterday');
  if (days < 7) return date.toLocaleDateString(locale, { weekday: 'short' });
  if (date.getFullYear() === today.getFullYear())
    return date.toLocaleDateString(locale, { month: 'numeric', day: 'numeric' });
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'numeric', day: 'numeric' });
}

const minuteListeners = new Set<() => void>();
let minuteNow = Date.now();
let minuteTimer: ReturnType<typeof setInterval> | undefined;

function subscribeMinute(listener: () => void): () => void {
  minuteListeners.add(listener);
  if (minuteTimer === undefined) {
    minuteNow = Date.now();
    minuteTimer = setInterval(() => {
      minuteNow = Date.now();
      minuteListeners.forEach((notify) => notify());
    }, 60_000);
  }
  return () => {
    minuteListeners.delete(listener);
    if (minuteListeners.size > 0 || minuteTimer === undefined) return;
    clearInterval(minuteTimer);
    minuteTimer = undefined;
  };
}

export function useMinuteNow(): number {
  return useSyncExternalStore(
    subscribeMinute,
    () => minuteNow,
    () => minuteNow,
  );
}
