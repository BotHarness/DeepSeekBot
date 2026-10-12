import type { ReactElement } from 'react';
import { Button, Checkbox, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  FailureAlertDelivery,
  FailureAlertSnapshot,
} from '../../../core/src/messaging/failure-alerts.js';
import { MessagingHelp } from './messaging-help.js';
import { NotificationHistory, notificationTimeColumn } from './notification-history.js';
import type { BotHarnessTranslate } from './locale.js';

export interface FailureAlertSettingsProps {
  snapshot?: FailureAlertSnapshot;
  busy: boolean;
  save(enabled: boolean, revision: number): Promise<void>;
  test(): Promise<void>;
  retry(id: string): Promise<void>;
  openSession(sessionId: string): void;
  t: BotHarnessTranslate;
}

export function FailureAlertSettings({
  snapshot,
  busy,
  save,
  test,
  t,
}: FailureAlertSettingsProps): ReactElement {
  return (
    <section className="bh-im-pairing-request" aria-label={t('failureAlerts.title')}>
      <div className="bh-im-actions">
        <Checkbox
          checked={snapshot?.enabled ?? false}
          disabled={busy || !snapshot}
          label={t('failureAlerts.title')}
          onChange={(enabled) => void save(enabled, snapshot?.revision ?? 0)}
        />
        <MessagingHelp title={t('failureAlerts.title')} text={t('failureAlerts.hint')} t={t} />
      </div>
      {snapshot?.enabled && !snapshot.available ? (
        <p role="status" className="bh-muted">
          {t('failureAlerts.unavailable')}
        </p>
      ) : null}
      <div className="bh-im-actions">
        <Button
          size="sm"
          variant="toolbar"
          disabled={busy || !snapshot?.enabled || !snapshot.available}
          onClick={() => void test()}
        >
          {t('failureAlerts.test')}
        </Button>
      </div>
    </section>
  );
}

export function FailureAlertHistory({
  snapshot,
  busy,
  retry,
  openSession,
  t,
}: Omit<FailureAlertSettingsProps, 'save' | 'test'>): ReactElement {
  return (
    <NotificationHistory<FailureAlertDelivery>
      data={snapshot?.deliveries ?? []}
      columns={[
        {
          id: 'event',
          accessorFn: (delivery) =>
            `${t(delivery.sessionId ? 'failureAlerts.event' : 'failureAlerts.testLabel')} ${delivery.id}`,
          header: t('approvalIm.event'),
          cell: ({ row }) =>
            t(row.original.sessionId ? 'failureAlerts.event' : 'failureAlerts.testLabel'),
        },
        {
          id: 'status',
          accessorFn: (delivery) => t(`failureAlerts.state.${delivery.state}`),
          header: t('approvalIm.deliveryState'),
          cell: ({ getValue }) => <Tag className="bh-management-state">{String(getValue())}</Tag>,
        },
        notificationTimeColumn(t),
      ]}
      label={t('approvalIm.failureHistory')}
      busy={busy}
      t={t}
      details={(delivery) => (
        <>
          <div className="bh-im-actions">
            <strong>
              {t(delivery.sessionId ? 'failureAlerts.event' : 'failureAlerts.testLabel')}
            </strong>
            <Tag>{t(`failureAlerts.state.${delivery.state}`)}</Tag>
            <span className="bh-pairing-toolbar-gap" />
            {delivery.sessionId ? (
              <Button size="sm" variant="toolbar" onClick={() => openSession(delivery.sessionId!)}>
                {t('failureAlerts.openSession')}
              </Button>
            ) : null}
            {delivery.state === 'failed' &&
            delivery.attempts < 3 &&
            snapshot?.enabled &&
            snapshot.available ? (
              <Button
                size="sm"
                variant="toolbar"
                disabled={busy}
                onClick={() => void retry(delivery.id)}
              >
                {t('approvalIm.retry')}
              </Button>
            ) : null}
          </div>
          {delivery.state === 'unknown-outcome' ? (
            <p role="status" className="bh-muted">
              {t('failureAlerts.unknown')}
            </p>
          ) : null}
          <dl>
            <div>
              <dt>{t('approvalIm.reference')}</dt>
              <dd>
                <code>{delivery.id}</code>
              </dd>
            </div>
            <div>
              <dt>{t('approvalIm.attempts')}</dt>
              <dd>{delivery.attempts} / 3</dd>
            </div>
            {delivery.reason ? (
              <div>
                <dt>{t('approvalIm.reason')}</dt>
                <dd>
                  <code>{delivery.reason}</code>
                </dd>
              </div>
            ) : null}
          </dl>
        </>
      )}
    />
  );
}
