import type { ReactElement } from 'react';
import type { BotHarnessTranslate } from './locale.js';
import { marketplaceError, type Phase } from './marketplace-feedback.js';

export const MAX_REPORT_REASON_LENGTH = 500;

export type ReportState =
  | { status: 'closed' }
  | { status: 'open'; reason: string; phase: Phase; cause?: unknown }
  | { status: 'done' };

export function ReportPanel({
  state,
  t,
  onReason,
}: {
  state: ReportState;
  t: BotHarnessTranslate;
  onReason: (reason: string) => void;
}): ReactElement | null {
  if (state.status === 'closed') return null;
  if (state.status === 'done') {
    return (
      <div className="bh-market-report" role="status" data-market-report="done">
        <strong>{t('market.report.doneTitle')}</strong>
        <span>{t('market.report.done')}</span>
      </div>
    );
  }
  return (
    <div className="bh-market-report" data-market-report="open">
      <strong>{t('market.report.title')}</strong>
      <span className="bh-market-hint">{t('market.report.hint')}</span>
      <label>
        <span>{t('market.report.reason')}</span>
        <textarea
          rows={3}
          maxLength={MAX_REPORT_REASON_LENGTH}
          placeholder={t('market.report.placeholder')}
          value={state.reason}
          disabled={state.phase !== 'idle'}
          onChange={(event) => onReason(event.currentTarget.value)}
        />
      </label>
      {state.phase === 'verifying' ? (
        <span className="bh-market-hint" role="status">
          {t('market.challenge.verifying')}
        </span>
      ) : null}
      {state.cause === undefined ? null : (
        <div className="bh-modal-error" role="alert">
          {marketplaceError(state.cause, t)}
        </div>
      )}
    </div>
  );
}
