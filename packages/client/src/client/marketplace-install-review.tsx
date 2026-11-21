import type { ReactElement } from 'react';
import type { InstallFinding, InstallReviewResult } from './bridge.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { Callout } from './ds/callout.js';
import { Note } from './ds/note.js';
import { ReadFailure } from './ds/read-failure.js';
import type { BotHarnessTranslate } from './locale.js';
import { marketplaceError } from './marketplace-feedback.js';

export type ReviewState =
  | { status: 'reviewing' }
  | { status: 'ready'; result: InstallReviewResult }
  | { status: 'error'; cause: unknown };

const FINDING_ICONS: Record<InstallFinding['kind'], string> = {
  'prompt-injection': 'text-quote',
  exfiltration: 'globe',
  script: 'terminal',
};

function InstallFindings({
  findings,
  t,
}: {
  findings: readonly InstallFinding[];
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <ul className="bh-market-findings">
      {findings.map((finding) => (
        <li
          key={finding.kind + finding.path}
          className="bh-market-finding"
          data-market-finding={finding.kind}
        >
          <span className="bh-market-finding-icon" data-tone={finding.kind}>
            <ChannelSidebarIcon name={FINDING_ICONS[finding.kind]} size={14} />
          </span>
          <span className="bh-market-finding-body">
            <span className="bh-market-finding-head">
              <strong>{t(`market.review.kind.${finding.kind}`)}</strong>
              <code>{finding.path}</code>
            </span>
            {finding.note === undefined ? null : <span>{finding.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function InstallReviewView({
  state,
  t,
  onRetry,
}: {
  state: ReviewState;
  t: BotHarnessTranslate;
  onRetry: () => void;
}): ReactElement {
  if (state.status === 'reviewing')
    return (
      <div className="bh-market-review" data-market-review="reviewing" role="status">
        <span className="bh-market-review-pulse" aria-hidden="true" />
        {t('market.review.reviewing')}
      </div>
    );
  if (state.status === 'error')
    return (
      <ReadFailure retryLabel={t('market.retry')} onRetry={onRetry}>
        {t('market.review.failed', { error: marketplaceError(state.cause, t) })}
      </ReadFailure>
    );
  const { review } = state.result;
  if (review.status === 'unavailable')
    return (
      <div className="bh-market-review-result" data-market-review="unavailable">
        <Callout tone="warning" role="alert" title={t('market.review.unavailable')}>
          {t('market.review.unavailableHint')}
        </Callout>
        {review.findings.length === 0 ? null : <InstallFindings findings={review.findings} t={t} />}
      </div>
    );
  if (review.findings.length === 0)
    return (
      <div className="bh-market-review" data-market-review="clean" data-tone="clean" role="status">
        <ChannelSidebarIcon name="shield-check" size={16} />
        {t('market.review.clean')}
        {review.partial ? <Note tone="subtle">{t('market.review.partial')}</Note> : null}
      </div>
    );
  return (
    <div className="bh-market-review-result" data-market-review="findings">
      <Callout
        tone="danger"
        role="alert"
        title={t('market.review.found', {
          count: String(review.findings.length),
        })}
      >
        <InstallFindings findings={review.findings} t={t} />
      </Callout>
      {review.partial ? <Note tone="subtle">{t('market.review.partial')}</Note> : null}
    </div>
  );
}

export function installLabel(
  review: ReviewState,
  installing: boolean,
  t: BotHarnessTranslate,
): string {
  if (installing) return t('market.confirm.installing');
  if (review.status !== 'ready') return t('market.confirm.reviewing');
  if (review.result.review.status === 'unavailable') return t('market.confirm.installUnreviewed');
  return review.result.review.findings.length === 0
    ? t('market.confirm.install')
    : t('market.confirm.installAnyway');
}
