import type { ReactElement } from 'react';
import type { ReceptionRecovery } from '../../../core/src/messaging/receiver-recovery.js';
import type { BotHarnessTranslate } from './locale.js';

export function ReceptionStatus({
  reception,
  recovery,
  t,
}: {
  reception: 'off' | 'connecting' | 'receiving' | 'unavailable' | undefined;
  recovery?: ReceptionRecovery | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  if (reception === 'off' || reception === 'receiving')
    return (
      <span role="status">
        {t('reception.label')}: {t(`reception.${reception}`)}
      </span>
    );
  if (recovery?.kind === 'retrying')
    return (
      <span role="status">
        {t('reception.label')}: {t('reception.retrying')} · {t('reception.retryAt')}{' '}
        <time dateTime={recovery.nextRetryAt}>
          {new Date(recovery.nextRetryAt).toLocaleTimeString()}
        </time>
        {' · '}
        {t('reception.waitingForApp')}
      </span>
    );
  if (recovery?.kind === 'action-required')
    return (
      <span role="status">
        {t('reception.label')}: {t('reception.actionRequired')} ·{' '}
        {t(
          recovery.reason === 'rebind-required'
            ? 'reception.checkAccount'
            : ['provider-incompatible', 'capability-unavailable', 'consumer-unavailable'].includes(
                  recovery.reason,
                )
              ? 'reception.checkProvider'
              : 'reception.tryReconnect',
        )}
      </span>
    );
  return (
    <span role="status">
      {t('reception.label')}:{' '}
      {t(reception === 'unavailable' ? 'reception.actionRequired' : 'reception.connecting')}
    </span>
  );
}
