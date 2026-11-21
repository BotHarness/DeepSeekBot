import {
  ENGINE_QUOTA_WINDOWS,
  type EngineQuotaWindowId,
} from '@botharness/host-protocol/subscription-engine';
import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import type { SessionEngineQuota } from './bridge.js';
import { Button } from './ds/button.js';
import { Icon } from './ds/icon.js';
import { IconButton } from './ds/icon-button.js';
import { Note } from './ds/note.js';
import { space } from './ds/tokens.stylex.js';
import { ink, layer, radius, status as statusColor, type as typeScale } from './ds/tobs.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { shortTime } from './session-engine.js';

const STALE_MS = 5 * 60_000;

const styles = stylex.create({
  panel: { display: 'grid', gap: space.x3 },
  windows: { display: 'grid', gap: space.x3, margin: 0, padding: 0, listStyle: 'none' },
  window: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 7rem) minmax(0, 1fr)',
    alignItems: 'center',
    gap: space.x5,
  },
  head: { display: 'grid', gap: space.x1, minWidth: 0 },
  name: {
    fontSize: typeScale.captionSize,
    lineHeight: typeScale.captionLine,
    color: ink.secondary,
  },
  amount: { display: 'flex', alignItems: 'baseline', gap: space.x2, whiteSpace: 'nowrap' },
  percent: {
    fontSize: typeScale.displaySize,
    lineHeight: typeScale.displayLine,
    fontWeight: typeScale.displayWeight,
    fontVariantNumeric: 'tabular-nums',
    color: ink.primary,
  },
  unit: { fontSize: typeScale.captionSize, lineHeight: typeScale.captionLine, color: ink.tertiary },
  track: {
    display: 'block',
    position: 'relative',
    height: space.x6,
    borderRadius: radius.sm,
    backgroundColor: layer.well,
    overflow: 'hidden',
  },
  fill: { display: 'block', height: '100%', borderRadius: radius.sm },
  width: (percent: number) => ({ width: `${percent}%` }),
  high: { backgroundColor: statusColor.successBase },
  medium: { backgroundColor: statusColor.warningBase },
  low: { backgroundColor: statusColor.dangerBase },
  reset: {
    position: 'absolute',
    insetBlock: 0,
    insetInlineEnd: space.x3,
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    fontSize: typeScale.captionSize,
    lineHeight: typeScale.captionLine,
    fontVariantNumeric: 'tabular-nums',
    color: ink.secondary,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'end',
    gap: space.x2,
    fontSize: typeScale.captionSize,
    lineHeight: typeScale.captionLine,
    color: ink.tertiary,
  },
});

export type QuotaRefreshState =
  | { state: 'idle' }
  | { state: 'refreshing' }
  | { state: 'failed'; reason: 'unavailable' | 'signed-out' | 'timeout' };

export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '•••';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const suffix = dot > 0 ? domain.slice(dot) : '';
  return `${local.slice(0, local.length > 2 ? 2 : 1)}•••@${host.slice(0, 1)}•••${suffix}`;
}

export function MaskedEmail({ email, t }: { email: string; t: BotHarnessTranslate }): ReactElement {
  const [shown, setShown] = useState(false);
  return (
    <Button
      variant="text"
      aria-pressed={shown}
      aria-label={shown ? t('modelProviders.hideEmail') : t('modelProviders.showEmail')}
      title={shown ? t('modelProviders.hideEmail') : t('modelProviders.showEmail')}
      data-account-email={shown ? 'shown' : 'masked'}
      onClick={() => setShown((value) => !value)}
    >
      {shown ? email : maskEmail(email)}
    </Button>
  );
}

type QuotaWindows = NonNullable<SessionEngineQuota['windows']>;

function shownWindows(
  quota: SessionEngineQuota | undefined,
  now: number,
): { id: EngineQuotaWindowId; remaining: number; resetsAt?: string }[] {
  const windows: QuotaWindows = quota?.windows ?? {};
  return ENGINE_QUOTA_WINDOWS.flatMap((id) => {
    const window = windows[id];
    if (window?.remainingPercent === undefined) return [];
    if (window.resetsAt !== undefined && Date.parse(window.resetsAt) <= now) return [];
    return [
      {
        id,
        remaining: Math.round(window.remainingPercent),
        ...(window.resetsAt === undefined ? {} : { resetsAt: window.resetsAt }),
      },
    ];
  });
}

export function quotaLimited(quota: SessionEngineQuota | undefined, now: number): boolean {
  return quota?.limitedUntil !== undefined && Date.parse(quota.limitedUntil) > now;
}

export function quotaRemaining(
  quota: SessionEngineQuota | undefined,
  now: number,
): number | undefined {
  const windows = shownWindows(quota, now);
  if (windows.length > 0) return Math.min(...windows.map((window) => window.remaining));
  if (quota?.usedPercent === undefined) return undefined;
  if (quota.resetsAt !== undefined && Date.parse(quota.resetsAt) <= now) return undefined;
  return Math.max(0, Math.round(100 - quota.usedPercent));
}

export function quotaSummary(
  quota: SessionEngineQuota | undefined,
  now: number,
  t: BotHarnessTranslate,
): string {
  if (quotaLimited(quota, now)) return t('modelProviders.quotaExhausted');
  const remaining = quotaRemaining(quota, now);
  return remaining === undefined
    ? t('modelProviders.quotaView')
    : t('modelProviders.quotaRemaining', { percent: String(remaining) });
}

export function quotaStale(quota: SessionEngineQuota | undefined, now: number): boolean {
  return (
    quota === undefined || quota.source !== 'live' || now - Date.parse(quota.observedAt) > STALE_MS
  );
}

function updatedText(observedAt: string, now: number, t: BotHarnessTranslate): string {
  const minutes = Math.floor((now - Date.parse(observedAt)) / 60_000);
  if (minutes < 1) return t('modelProviders.quotaUpdatedNow');
  if (minutes < 60) return t('modelProviders.quotaUpdatedMinutes', { count: String(minutes) });
  return t('modelProviders.quotaUpdatedAt', { time: shortTime(observedAt) });
}

function windowLabel(id: EngineQuotaWindowId, t: BotHarnessTranslate): string {
  return id === 'session' ? t('modelProviders.quotaSession') : t('modelProviders.quotaWeekly');
}

type Level = 'high' | 'medium' | 'low';
const level = (remaining: number): Level =>
  remaining >= 50 ? 'high' : remaining >= 20 ? 'medium' : 'low';

function countdown(resetsAt: string, now: number, t: BotHarnessTranslate): string {
  const minutes = Math.max(1, Math.ceil((Date.parse(resetsAt) - now) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0)
    return t('modelProviders.quotaInDays', { days: String(days), hours: String(hours) });
  if (hours > 0)
    return t('modelProviders.quotaInHours', {
      hours: String(hours),
      minutes: String(minutes % 60),
    });
  return t('modelProviders.quotaInMinutes', { minutes: String(minutes) });
}

export function QuotaPanel({
  quota,
  refresh,
  now,
  onRefresh,
  t,
}: {
  quota: SessionEngineQuota | undefined;
  refresh: QuotaRefreshState;
  now: number;
  onRefresh?: (() => void) | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const windows = shownWindows(quota, now);
  const limited = quotaLimited(quota, now);
  return (
    <div {...stylex.props(styles.panel)} data-account-quota="">
      {windows.length === 0 ? (
        refresh.state === 'refreshing' ? null : (
          <Note>{t('modelProviders.quotaEmpty')}</Note>
        )
      ) : (
        <ul {...stylex.props(styles.windows)}>
          {windows.map((window) => (
            <li key={window.id} {...stylex.props(styles.window)} data-quota-window={window.id}>
              <span {...stylex.props(styles.head)}>
                <span {...stylex.props(styles.name)}>{windowLabel(window.id, t)}</span>
                <span {...stylex.props(styles.amount)}>
                  <span {...stylex.props(styles.percent)}>{window.remaining}%</span>
                  <span {...stylex.props(styles.unit)}>{t('modelProviders.quotaLeft')}</span>
                </span>
              </span>
              <span
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={window.remaining}
                aria-label={windowLabel(window.id, t)}
                aria-valuetext={t('modelProviders.quotaRemaining', {
                  percent: String(window.remaining),
                })}
                {...stylex.props(styles.track)}
              >
                <span
                  {...stylex.props(
                    styles.fill,
                    styles.width(window.remaining),
                    styles[level(window.remaining)],
                  )}
                />
                {window.resetsAt === undefined ? null : (
                  <span
                    {...stylex.props(styles.reset)}
                    title={t('modelProviders.quotaResets', { time: shortTime(window.resetsAt) })}
                  >
                    <Icon name="refresh-cw" size={12} />
                    {countdown(window.resetsAt, now, t)}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {limited && quota?.limitedUntil !== undefined ? (
        <Note tone="warning">
          {t('modelProviders.quotaLimitedUntil', { time: shortTime(quota.limitedUntil) })}
        </Note>
      ) : null}
      {refresh.state === 'failed' ? (
        <Note tone="danger">
          {refresh.reason === 'timeout'
            ? t('modelProviders.quotaTimeout')
            : refresh.reason === 'signed-out'
              ? t('modelProviders.quotaSignedOut')
              : t('modelProviders.quotaUnavailable')}
        </Note>
      ) : null}
      <div {...stylex.props(styles.footer)}>
        <span>
          {refresh.state === 'refreshing'
            ? t('modelProviders.quotaRefreshing')
            : quota === undefined
              ? t('modelProviders.quotaNeverRead')
              : updatedText(quota.observedAt, now, t)}
        </span>
        {onRefresh === undefined ? null : (
          <IconButton
            aria-label={t('modelProviders.quotaRefresh')}
            title={t('modelProviders.quotaRefresh')}
            disabled={refresh.state === 'refreshing'}
            onClick={onRefresh}
          >
            <Icon name="refresh-cw" />
          </IconButton>
        )}
      </div>
    </div>
  );
}
