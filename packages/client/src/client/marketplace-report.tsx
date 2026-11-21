import { useRef, useState, type ReactElement } from 'react';
import type { BridgeActions } from './actions.js';
import { Button } from './ds/button.js';
import type { BotHarnessTranslate } from './locale.js';
import { marketplaceError, type Phase } from './marketplace-feedback.js';

export const MAX_REPORT_REASON_LENGTH = 500;

export type ReportState =
  | { status: 'closed' }
  | { status: 'open'; reason: string; phase: Phase; cause?: unknown }
  | { status: 'done' };

export function useMarketplaceReport(
  prove: () => Promise<string>,
  submit: BridgeActions['marketplaceReport'],
) {
  const [state, setState] = useState<ReportState>({ status: 'closed' });
  const attempt = useRef<symbol>();
  const close = () => {
    attempt.current = undefined;
    setState({ status: 'closed' });
  };
  const send = async (id: string) => {
    if (state.status !== 'open' || state.phase !== 'idle' || attempt.current !== undefined) return;
    const ticket = Symbol();
    attempt.current = ticket;
    const { reason } = state;
    setState({ status: 'open', reason, phase: 'verifying' });
    try {
      const altcha = await prove();
      if (attempt.current === ticket) setState({ status: 'open', reason, phase: 'sending' });
      await submit(id, altcha, reason.trim() || undefined);
      if (attempt.current === ticket) setState({ status: 'done' });
    } catch (cause) {
      if (attempt.current === ticket) setState({ status: 'open', reason, phase: 'idle', cause });
    } finally {
      if (attempt.current === ticket) attempt.current = undefined;
    }
  };
  return {
    state,
    close,
    send,
    open: () => setState({ status: 'open', reason: '', phase: 'idle' }),
    setReason: (reason: string) =>
      setState((current) =>
        current.status === 'open' ? { ...current, reason, cause: undefined } : current,
      ),
  };
}

type ReportControls = ReturnType<typeof useMarketplaceReport>;

export function ReportButton({
  report,
  t,
  disabled,
}: {
  report: ReportControls;
  t: BotHarnessTranslate;
  disabled?: boolean;
}): ReactElement | null {
  return report.state.status === 'closed' ? (
    <Button variant="ghost" disabled={disabled} onClick={report.open}>
      {t('market.report.open')}
    </Button>
  ) : null;
}

export function ReportActions({
  report,
  id,
  t,
}: {
  report: ReportControls;
  id: string;
  t: BotHarnessTranslate;
}): ReactElement | null {
  if (report.state.status !== 'open') return null;
  const { phase } = report.state;
  return (
    <>
      <Button variant="outline" disabled={phase !== 'idle'} onClick={report.close}>
        {t('common.cancel')}
      </Button>
      <Button variant="primary" disabled={phase !== 'idle'} onClick={() => void report.send(id)}>
        {phase === 'verifying'
          ? t('market.challenge.verifying')
          : phase === 'sending'
            ? t('market.report.sending')
            : t('market.report.send')}
      </Button>
    </>
  );
}

export function ReportPanel({
  report: { state, setReason },
  t,
  kind = 'bot',
}: {
  report: ReportControls;
  t: BotHarnessTranslate;
  kind?: 'bot' | 'avatar';
}): ReactElement | null {
  if (state.status === 'closed') return null;
  if (state.status === 'done') {
    return (
      <div className="bh-market-report" role="status" data-market-report="done">
        <strong>{t('market.report.doneTitle')}</strong>
        <span>{t(kind === 'bot' ? 'market.report.done' : 'market.avatar.report.done')}</span>
      </div>
    );
  }
  return (
    <div className="bh-market-report" data-market-report="open">
      <strong>{t(kind === 'bot' ? 'market.report.title' : 'market.avatar.report.title')}</strong>
      <span className="bh-market-hint">{t('market.report.hint')}</span>
      <label>
        <span>{t('market.report.reason')}</span>
        <textarea
          rows={3}
          maxLength={MAX_REPORT_REASON_LENGTH}
          placeholder={t(
            kind === 'bot' ? 'market.report.placeholder' : 'market.avatar.report.placeholder',
          )}
          value={state.reason}
          disabled={state.phase !== 'idle'}
          onChange={(event) => setReason(event.currentTarget.value)}
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
