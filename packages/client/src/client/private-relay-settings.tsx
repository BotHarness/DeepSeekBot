import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
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
  form: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  submit: { alignSelf: 'flex-start' },
});

export function PrivateRelaySettings({
  t,
  status,
  refresh,
  pair,
}: PropsLocale<'botharness'> & {
  status?: { state: string; origin?: string; issue?: string };
  refresh(): Promise<unknown>;
  pair(): void;
}): ReactElement {
  const [origin, setOrigin] = useState('');
  const [bootstrap, setBootstrap] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function claim() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch('./api/botharness/devices/private', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin, bootstrap, confirm: true }),
      });
      if (!response.ok) {
        setFailed(true);
        return;
      }
      setBootstrap('');
      await refresh();
    } catch {
      setFailed(true);
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
            {steps(1)}
            {address}
          </StatusBlock>
        )}
      </StatusStack>
    );
  }

  return (
    <StatusStack title={t('privateRelay.title')}>
      <StatusBlock
        icon="server"
        tone="accent"
        title={t('privateRelay.panel.offTitle')}
        body={t('privateRelay.deploy')}
        data={{ 'data-private-relay': 'off' }}
      >
        {steps(0)}
        <p {...stylex.props(styles.meta)}>{t('privateRelay.requirement')}</p>
        <div {...stylex.props(styles.form)}>
          <FieldStack>
            <TextField
              label={t('privateRelay.address')}
              value={origin}
              onChange={setOrigin}
              autoComplete="off"
            />
            <TextField
              label={t('privateRelay.secret')}
              value={bootstrap}
              onChange={setBootstrap}
              type="password"
              autoComplete="off"
            />
          </FieldStack>
          <Button
            variant="primary"
            disabled={busy || !origin.trim() || !bootstrap.trim()}
            onClick={() => void claim()}
            {...stylex.props(styles.submit)}
          >
            {t(busy ? 'privateRelay.connecting' : 'privateRelay.claim')}
          </Button>
        </div>
      </StatusBlock>
      {failed ? (
        <StatusBlock
          icon="info"
          tone="warning"
          title={t('privateTunnel.panel.failedTitle')}
          body={t('privateRelay.failed')}
          data={{ 'data-private-relay-failure': '' }}
        />
      ) : null}
    </StatusStack>
  );
}
