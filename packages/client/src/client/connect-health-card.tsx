import type { BotHarnessKey } from './locale.js';
import { useState } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import {
  connectHealthSchema,
  type ConnectHealthStatus,
  type ConnectHealthCode,
} from '../../../core/src/devices/connect-health-contract.js';
import { StatusBlock, StatusDisclosure, CopyChip, StatusFact } from './ds/status-block.js';
import { Note } from './ds/note.js';

const reason = {
  'signed-out': 'connect.health.signedOut',
  'connector-unavailable': 'connect.health.connector',
  'relay-unavailable': 'connect.health.relayUnavailable',
  'relay-offline': 'connect.health.relayOffline',
  'relay-status-unknown': 'connect.health.relayUnknown',
  dns: 'connect.health.dns',
  tls: 'connect.health.tls',
  timeout: 'connect.health.timeout',
  http: 'connect.health.http',
  handshake: 'connect.health.identity',
  identity: 'connect.health.identity',
  network: 'connect.health.network',
} satisfies Record<ConnectHealthCode, BotHarnessKey>;
export function connectHealthDiagnostic(health: ConnectHealthStatus): string {
  const parsed = connectHealthSchema.parse(health);
  return JSON.stringify({ version: 1, ...parsed }, null, 2);
}
export function ConnectHealthCard({
  t,
  health,
  reloadSnapshot,
  fresh = true,
}: {
  health: ConnectHealthStatus | undefined;
  reloadSnapshot(): Promise<unknown>;
  fresh?: boolean;
} & PropsLocale<'botharness'>) {
  const [busy, setBusy] = useState(false);
  const [requestFailed, setRequestFailed] = useState<{
    code: 'http' | 'network';
    httpStatus?: number;
    occurredAt: string;
  }>();
  const [details, setDetails] = useState(false);
  const parsed = connectHealthSchema.safeParse(health);
  const observed = parsed.success ? parsed.data : ({ state: 'idle' } satisfies ConnectHealthStatus);
  const current =
    !fresh && observed.state === 'passed'
      ? ({ ...observed, state: 'stale' } satisfies ConnectHealthStatus)
      : observed;
  const checking = busy || current.state === 'checking';
  const check = async () => {
    setBusy(true);
    setRequestFailed(undefined);
    try {
      const response = await fetch('./api/botharness/devices/connect-health', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) {
        setRequestFailed({
          code: 'http',
          httpStatus: response.status,
          occurredAt: new Date().toISOString(),
        });
        return;
      }
      await reloadSnapshot();
    } catch {
      setRequestFailed({ code: 'network', occurredAt: new Date().toISOString() });
    } finally {
      setBusy(false);
    }
  };
  const label = requestFailed
    ? t('connect.health.requestFailed')
    : checking
      ? t('connect.health.checking')
      : current.state === 'failed'
        ? t(reason[current.code])
        : t(
            current.state === 'passed'
              ? 'connect.health.passed'
              : current.state === 'stale'
                ? 'connect.health.stale'
                : 'connect.health.idle',
          );
  return (
    <StatusBlock
      icon="shield"
      title={t('connect.health.title')}
      body={label}
      tone={
        requestFailed || current.state === 'failed'
          ? 'warning'
          : current.state === 'passed'
            ? 'success'
            : 'neutral'
      }
      action={
        <Button variant="outline" size="sm" disabled={checking} onClick={() => void check()}>
          {t('connect.health.check')}
        </Button>
      }
      data={{ 'data-connect-health': current.state }}
    >
      {requestFailed ? <Note tone="danger">{t('connect.health.requestFailed')}</Note> : null}
      {current.state === 'passed' || current.state === 'failed' || current.state === 'stale' ? (
        <StatusFact label={t('connect.health.checkedAt')}>
          {new Date(current.checkedAt).toLocaleString()}
        </StatusFact>
      ) : null}
      <StatusDisclosure
        icon="info"
        title={t('connect.health.details')}
        open={details}
        onToggle={() => setDetails(!details)}
      >
        <Note>{t('connect.health.scope')}</Note>
        {current.state === 'failed' || current.state === 'checking' ? (
          <StatusFact label={t('connect.health.stage')}>
            {t(`connect.health.stage.${current.stage}`)}
          </StatusFact>
        ) : null}
        <CopyChip
          value={
            requestFailed
              ? JSON.stringify(
                  {
                    version: 1,
                    health: JSON.parse(connectHealthDiagnostic(current)),
                    requestFailure: requestFailed,
                  },
                  null,
                  2,
                )
              : connectHealthDiagnostic(current)
          }
          copyLabel={t('connect.health.copy')}
          copiedLabel={t('devices.connect.copied')}
          well
        />
      </StatusDisclosure>
    </StatusBlock>
  );
}
