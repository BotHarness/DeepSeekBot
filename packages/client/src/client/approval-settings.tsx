import { useId, useState, type ReactElement } from 'react';
import { Button, SegmentedTabs, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { Combobox } from './combobox.js';
import type { ApprovalMessagingSnapshot } from '../../../core/src/messaging/approval-messaging.js';
import type { FailureAlertSnapshot } from '../../../core/src/messaging/failure-alerts.js';
import type { BotHarnessTranslate } from './locale.js';
import { FailureAlertHistory, FailureAlertSettings } from './failure-alert-settings.js';
import { MessagingHelp } from './messaging-help.js';
import { NotificationHistory, notificationTimeColumn } from './notification-history.js';

type ApprovalRecord = ApprovalMessagingSnapshot['deliveries'][number];

function ApprovalHistory({
  snapshot,
  busy,
  available,
  retry,
  openSession,
  t,
}: {
  snapshot?: ApprovalMessagingSnapshot;
  busy: boolean;
  available: boolean;
  retry(id: string): Promise<void>;
  openSession(sessionId: string): void;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <NotificationHistory<ApprovalRecord>
      data={snapshot?.deliveries ?? []}
      columns={[
        {
          id: 'event',
          accessorFn: (delivery) =>
            `${t(delivery.status === 'test' ? 'approvalIm.testLabel' : 'approvalIm.request')} ${delivery.requestMessageId ?? delivery.id}`,
          header: t('approvalIm.event'),
          cell: ({ row }) =>
            t(row.original.status === 'test' ? 'approvalIm.testLabel' : 'approvalIm.request'),
        },
        {
          id: 'status',
          accessorFn: (delivery) => t(`approvalIm.delivery.${delivery.delivery}`),
          header: t('approvalIm.deliveryState'),
          cell: ({ getValue }) => <Tag className="bh-management-state">{String(getValue())}</Tag>,
        },
        notificationTimeColumn(t),
      ]}
      label={t('approvalIm.approvalHistory')}
      busy={busy}
      t={t}
      details={(delivery) => (
        <>
          <div className="bh-im-actions">
            <strong>
              {t(delivery.status === 'test' ? 'approvalIm.testLabel' : 'approvalIm.request')}
            </strong>
            <Tag>{t(`approvalIm.status.${delivery.status}`)}</Tag>
            <span className="bh-pairing-toolbar-gap" />
            {delivery.sessionId ? (
              <Button size="sm" variant="toolbar" onClick={() => openSession(delivery.sessionId!)}>
                {t('approvalIm.openSession')}
              </Button>
            ) : null}
            {delivery.delivery === 'failed' && delivery.attempts < 3 ? (
              <Button
                size="sm"
                variant="toolbar"
                disabled={busy || !available || !['pending', 'test'].includes(delivery.status)}
                onClick={() => void retry(delivery.id)}
              >
                {t('approvalIm.retry')}
              </Button>
            ) : null}
          </div>
          {delivery.update === 'failed' || delivery.update === 'unknown-outcome' ? (
            <p role="status" className="bh-muted">
              {t('approvalIm.updateUnconfirmed')}
            </p>
          ) : null}
          {delivery.delivery === 'unknown-outcome' ? (
            <p role="status" className="bh-muted">
              {t('approvalIm.unknownHint')}
            </p>
          ) : null}
          <dl>
            <div>
              <dt>{t('approvalIm.reference')}</dt>
              <dd>
                <code>{delivery.requestMessageId ?? delivery.id}</code>
              </dd>
            </div>
            <div>
              <dt>{t('approvalIm.attempts')}</dt>
              <dd>{delivery.attempts} / 3</dd>
            </div>
            {delivery.actor ? (
              <div>
                <dt>{t('approvalIm.actor')}</dt>
                <dd>
                  <code>{delivery.actor.actorId}</code>
                </dd>
              </div>
            ) : null}
            {delivery.resultSeq !== undefined ? (
              <div>
                <dt>{t('approvalIm.result')}</dt>
                <dd>{delivery.resultSeq}</dd>
              </div>
            ) : null}
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

export function ApprovalSettings({
  snapshot,
  busy,
  failed,
  save,
  test,
  retry,
  refresh,
  openSession,
  failureAlerts,
  t,
}: {
  snapshot?: ApprovalMessagingSnapshot;
  busy: boolean;
  failed: boolean;
  save(pairingId: string | null, revision: number): Promise<void>;
  test(): Promise<void>;
  retry(id: string): Promise<void>;
  refresh(): Promise<void>;
  openSession(sessionId: string): void;
  failureAlerts?: {
    snapshot?: FailureAlertSnapshot;
    save(enabled: boolean, revision: number): Promise<void>;
    test(): Promise<void>;
    retry(id: string): Promise<void>;
  };
  t: BotHarnessTranslate;
}): ReactElement {
  const id = useId();
  const [selected, setSelected] = useState(snapshot?.route?.pairingId ?? '');
  const [tab, setTab] = useState<'failures' | 'approvals'>(
    failureAlerts ? 'failures' : 'approvals',
  );
  const destination = snapshot?.destinations.find(
    (item) => item.pairingId === snapshot.route?.pairingId,
  );
  const available = destination?.ready === true;
  const approvalTab = {
    value: 'approvals' as const,
    label: `${t('approvalIm.approvalHistory')} (${snapshot?.deliveries.length ?? 0})`,
    id: `${id}-approvals`,
    panelId: `${id}-panel-approvals`,
  };
  const failureTab = {
    value: 'failures' as const,
    label: `${t('approvalIm.failureHistory')} (${failureAlerts?.snapshot?.deliveries.length ?? 0})`,
    id: `${id}-failures`,
    panelId: `${id}-panel-failures`,
  };
  return (
    <section className="bh-im-pairing" aria-label={t('approvalIm.title')}>
      {failed ? (
        <p role="alert" className="bh-error">
          {t('approvalIm.error')}
        </p>
      ) : null}
      <div className="bh-management-workspace">
        <aside className="bh-management-settings" aria-label={t('approvalIm.configuration')}>
          <section className="bh-im-pairing-request" aria-label={t('approvalIm.destination')}>
            <div className="bh-im-actions">
              <strong>{t('approvalIm.destination')}</strong>
              <Tag>{t('approvalIm.platform')}</Tag>
              <MessagingHelp
                title={t('approvalIm.destination')}
                text={t('approvalIm.hint')}
                t={t}
              />
            </div>
            <Combobox
              searchable={false}
              label={t('approvalIm.destination')}
              toggleLabel={t('approvalIm.destination')}
              value={selected}
              fallbackValue=""
              disabled={busy || !snapshot}
              onSelect={setSelected}
              options={[
                { value: '', label: t('approvalIm.off') },
                ...(snapshot?.destinations ?? []).map((item) => ({
                  value: item.pairingId,
                  label: item.name,
                  hint: `${item.accountName} · ${item.reference}`,
                  disabled: !item.ready,
                })),
              ]}
            />
            {destination ? <p className="bh-muted">{destination.accountName}</p> : null}
            {snapshot?.destinations.length === 0 ? (
              <p className="bh-muted">{t('approvalIm.empty')}</p>
            ) : null}
            <div className="bh-im-actions">
              <Button
                size="sm"
                variant="primary"
                disabled={busy || !snapshot || selected === (snapshot.route?.pairingId ?? '')}
                onClick={() => void save(selected || null, snapshot?.routeRevision ?? 0)}
              >
                {t('approvalIm.save')}
              </Button>
            </div>
          </section>
          <section className="bh-im-pairing-request" aria-label={t('approvalIm.approvalHistory')}>
            <div className="bh-im-actions">
              <strong>{t('approvalIm.approvalHistory')}</strong>
              <MessagingHelp
                title={t('approvalIm.approvalHistory')}
                text={t('approvalIm.once')}
                t={t}
              />
            </div>
            <div className="bh-im-actions">
              <Tag>
                {t(
                  snapshot?.route
                    ? available
                      ? 'approvalIm.enabled'
                      : 'approvalIm.unavailable'
                    : 'approvalIm.disabled',
                )}
              </Tag>
              <Button
                size="sm"
                variant="toolbar"
                disabled={busy || !available}
                onClick={() => void test()}
              >
                {t('approvalIm.test')}
              </Button>
            </div>
          </section>
          {failureAlerts ? (
            <FailureAlertSettings {...failureAlerts} busy={busy} openSession={openSession} t={t} />
          ) : null}
        </aside>
        <section className="bh-management-records" aria-label={t('approvalIm.history')}>
          <div className="bh-im-actions">
            <strong>{t('approvalIm.history')}</strong>
            <MessagingHelp
              title={t('approvalIm.history')}
              text={t('approvalIm.historyHelp')}
              t={t}
            />
            <span className="bh-pairing-toolbar-gap" />
            <Button size="sm" variant="toolbar" disabled={busy} onClick={() => void refresh()}>
              {t('approvalIm.refresh')}
            </Button>
          </div>
          <SegmentedTabs
            label={t('approvalIm.history')}
            value={tab}
            onChange={setTab}
            items={failureAlerts ? [failureTab, approvalTab] : [approvalTab]}
          />
          <div role="tabpanel" id={`${id}-panel-${tab}`} aria-labelledby={`${id}-${tab}`}>
            {tab === 'failures' && failureAlerts ? (
              <FailureAlertHistory {...failureAlerts} busy={busy} openSession={openSession} t={t} />
            ) : (
              <ApprovalHistory
                {...(snapshot ? { snapshot } : {})}
                busy={busy}
                available={available}
                retry={retry}
                openSession={openSession}
                t={t}
              />
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
