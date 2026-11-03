import type { ReactElement } from 'react';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { QuestionDelivery } from '../../../core/src/messaging/question-messaging.js';
import type { BotHarnessTranslate } from './locale.js';

export function QuestionNotifications({
  deliveries,
  busy,
  repair,
  openSession,
  t,
}: {
  deliveries: QuestionDelivery[];
  busy: boolean;
  repair(id: string): Promise<void>;
  openSession(id: string): void;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <section className="bh-im-pairing" aria-label={t('questionIm.title')}>
      <strong>{t('questionIm.title')}</strong>
      <p className="bh-muted">{t('questionIm.hint')}</p>
      {deliveries.length === 0 ? <p className="bh-muted">{t('questionIm.empty')}</p> : null}
      {deliveries.map((delivery) => {
        const canRepair =
          (delivery.submission === 'unknown-outcome' &&
            ['pending', 'answered'].includes(delivery.status)) ||
          (delivery.delivery === 'failed' &&
            delivery.attempts < 3 &&
            delivery.status === 'pending') ||
          (delivery.receipt !== undefined && delivery.update === 'failed');
        return (
          <article key={delivery.id} className="bh-im-pairing-request">
            <div className="bh-im-actions">
              <strong>{delivery.reference}</strong>
              <Tag>{t(`questionIm.status.${delivery.status}`)}</Tag>
              <Tag>{t(`approvalIm.delivery.${delivery.delivery}`)}</Tag>
            </div>
            <p role="status">{t(`questionIm.submission.${delivery.submission}`)}</p>
            {delivery.update === 'unknown-outcome' || delivery.update === 'failed' ? (
              <p role="status">{t('approvalIm.updateUnconfirmed')}</p>
            ) : null}
            {delivery.delivery === 'unknown-outcome' ? (
              <p role="status">{t('approvalIm.unknownHint')}</p>
            ) : null}
            <div className="bh-im-actions">
              <Button size="sm" variant="toolbar" onClick={() => openSession(delivery.sessionId)}>
                {t('approvalIm.openSession')}
              </Button>
              {canRepair ? (
                <Button
                  size="sm"
                  variant="toolbar"
                  disabled={busy}
                  onClick={() => void repair(delivery.id)}
                >
                  {t(
                    delivery.submission === 'unknown-outcome'
                      ? 'questionIm.reconcile'
                      : 'questionIm.repair',
                  )}
                </Button>
              ) : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}
