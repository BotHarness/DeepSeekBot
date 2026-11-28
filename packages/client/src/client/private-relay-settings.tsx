import { Button } from './ds/button.js';
import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { ConnectionGuide } from './connection-guide.js';
import { FieldStack, TextField } from './ds/field.js';
import { CopyChip, StatusBlock, StatusStack } from './ds/status-block.js';
import { StepProgress } from './ds/step-progress.js';
import { color, space, text } from './ds/tokens.stylex.js';

const styles = stylex.create({
  meta: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    minWidth: 0,
  },
  submit: { alignSelf: 'flex-start' },
});

export function PrivateRelaySettings({
  t,
  status,
  refresh,
  pair,
  locked = false,
}: PropsLocale<'botharness'> & {
  status?: { state: string; origin?: string; issue?: string };
  refresh(): Promise<unknown>;
  pair(): void;
  locked?: boolean;
}): ReactElement {
  const [legacy, setLegacy] = useState(false);
  const [code, setCode] = useState('');
  const [origin, setOrigin] = useState('');
  const [bootstrap, setBootstrap] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ code: string; host?: string }>();
  const ready = legacy ? !!origin.trim() && !!bootstrap.trim() : !!code.trim();
  async function claim() {
    if (locked || busy || !ready) return;
    setBusy(true);
    setFailure(undefined);
    try {
      const response = await fetch('./api/botharness/devices/private', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          legacy ? { origin, bootstrap, confirm: true } : { code, confirm: true },
        ),
      });
      if (!response.ok) {
        const value: unknown = await response.json().catch(() => undefined);
        const issue =
          typeof value === 'object' &&
          value !== null &&
          'code' in value &&
          typeof value.code === 'string'
            ? value.code
            : 'unknown';
        const host =
          typeof value === 'object' &&
          value !== null &&
          'host' in value &&
          typeof value.host === 'string' &&
          /^[a-z0-9][a-z0-9-]{0,31}$/u.test(value.host)
            ? value.host
            : undefined;
        setFailure(host === undefined ? { code: issue } : { code: issue, host });
        return;
      }
      setCode('');
      setBootstrap('');
      await refresh();
    } catch {
      setFailure({ code: 'unknown' });
    } finally {
      setBusy(false);
    }
  }
  const steps = (step: number) => (
    <StepProgress
      label={t('privateRelay.panel.steps')}
      steps={[
        t('privateRelay.panel.stepDeploy'),
        t('privateRelay.panel.stepClaim'),
        t('privateTunnel.panel.stepPair'),
      ]}
      step={step}
    />
  );
  const address =
    status?.origin === undefined ? null : (
      <CopyChip
        value={status.origin}
        copyLabel={t('devices.route.copy')}
        copiedLabel={t('devices.pair.copied')}
        marker="data-private-relay-origin"
      />
    );

  if (status && status.state !== 'off') {
    const state = status.state;
    return (
      <StatusStack title={t('privateRelay.title')}>
        <ConnectionGuide t={t} method="relay" />
        {steps(state === 'connected' ? 2 : 1)}
        {state === 'connected' ? (
          <StatusBlock
            icon="check"
            tone="success"
            title={t('privateTunnel.panel.connectedTitle')}
            body={t('privateRelay.connected')}
            action={
              <Button variant="primary" size="sm" onClick={pair}>
                {t('privateRelay.pair')}
              </Button>
            }
            data={{ 'data-private-relay': 'connected' }}
          >
            {address}
          </StatusBlock>
        ) : state === 'error' ? (
          <StatusBlock
            icon="info"
            tone="warning"
            title={t('privateTunnel.panel.errorTitle')}
            body={t('privateRelay.failed')}
            data={{ 'data-private-relay': 'error' }}
          >
            {address}
          </StatusBlock>
        ) : (
          <StatusBlock
            icon="server"
            tone="accent"
            title={t('privateRelay.connecting')}
            body={t('privateRelay.requirement')}
            data={{ 'data-private-relay': state }}
          >
            {address}
          </StatusBlock>
        )}
      </StatusStack>
    );
  }

  return (
    <StatusStack title={t('privateRelay.title')}>
      <ConnectionGuide t={t} method="relay" />
      <StatusBlock
        icon="server"
        tone="accent"
        title={t('privateRelay.panel.offTitle')}
        body={t('privateRelay.deploy')}
        data={{ 'data-private-relay': 'off' }}
      >
        {steps(0)}
        <p {...stylex.props(styles.meta)}>{t('privateRelay.requirement')}</p>
        {locked ? null : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void claim();
            }}
            {...stylex.props(styles.form)}
          >
            {legacy ? (
              <FieldStack>
                <TextField
                  label={t('privateRelay.address')}
                  value={origin}
                  onChange={setOrigin}
                  autoComplete="off"
                  disabled={busy}
                />
                <TextField
                  label={t('privateRelay.secret')}
                  value={bootstrap}
                  onChange={setBootstrap}
                  type="password"
                  autoComplete="off"
                  disabled={busy}
                />
              </FieldStack>
            ) : (
              <TextField
                label={t('privateRelay.code')}
                value={code}
                onChange={setCode}
                type="password"
                autoComplete="off"
                maxLength={512}
                disabled={busy}
              />
            )}
            <Button
              variant="primary"
              type="submit"
              disabled={busy || !ready}
              {...stylex.props(styles.submit)}
            >
              {t(busy ? 'privateRelay.connecting' : 'privateRelay.claim')}
            </Button>
            <Button
              variant="text"
              disabled={busy}
              onClick={() => {
                setLegacy(!legacy);
                setCode('');
                setBootstrap('');
                setFailure(undefined);
              }}
              {...stylex.props(styles.submit)}
            >
              {t(legacy ? 'privateRelay.useCode' : 'privateRelay.useLegacyKey')}
            </Button>
          </form>
        )}
      </StatusBlock>
      {failure ? (
        <StatusBlock
          icon="info"
          tone="warning"
          title={t('privateTunnel.panel.failedTitle')}
          body={
            failure.host && failure.code === 'private-relay-code-expired'
              ? t('privateRelay.codeExpired', { host: failure.host })
              : failure.host && failure.code === 'private-relay-code-used'
                ? t('privateRelay.codeUsed', { host: failure.host })
                : failure.host && failure.code === 'private-relay-code-refused'
                  ? t('privateRelay.codeRefused', { host: failure.host })
                  : !legacy && failure.code === 'private-relay-input-invalid'
                    ? t('privateRelay.codeInvalid')
                    : t('privateRelay.failed')
          }
          data={{ 'data-private-relay-failure': '' }}
        />
      ) : null}
    </StatusStack>
  );
}
