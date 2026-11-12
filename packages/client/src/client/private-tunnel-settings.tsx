import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { ChoiceButton } from './ds/choice-button.js';
import { FieldStack, TextField } from './ds/field.js';
import { SettingsRow } from './ds/settings-row.js';
import {
  CopyChip,
  StatusBadge,
  StatusBlock,
  StatusDisclosure,
  StatusFact,
  StatusHeading,
  StatusStack,
} from './ds/status-block.js';
import { StepProgress } from './ds/step-progress.js';
import { color, space, text } from './ds/tokens.stylex.js';

export interface PrivateTunnelView {
  state: 'off' | 'starting' | 'verifying' | 'connected' | 'error';
  mode?: 'quick' | 'named' | 'ingress';
  lan?: boolean;
  origin?: string;
  originPort?: number;
  issue?: string;
  probe?: string;
  addressChanged?: boolean;
}

export type PrivateTunnelStep = 'choose' | 'named' | 'ingress';

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

type Translate = PropsLocale<'botharness'>['t'];

function chip(t: Translate, value: string, marker?: `data-${string}`): ReactElement {
  return (
    <CopyChip
      value={value}
      copyLabel={t('devices.route.copy')}
      copiedLabel={t('devices.pair.copied')}
      {...(marker === undefined ? {} : { marker })}
    />
  );
}

function modeTitle(mode: PrivateTunnelView['mode']) {
  return mode === 'named'
    ? 'privateTunnel.namedTitle'
    : mode === 'ingress'
      ? 'privateTunnel.ingressTitle'
      : 'privateTunnel.quickTitle';
}

export function PrivateTunnelSettings({
  t,
  status,
  refresh,
  pair,
  advanced,
  step,
  setStep,
}: PropsLocale<'botharness'> & {
  status?: PrivateTunnelView;
  refresh(): Promise<unknown>;
  pair(): void;
  advanced(): void;
  step: PrivateTunnelStep;
  setStep(step: PrivateTunnelStep): void;
}): ReactElement {
  const [hostname, setHostname] = useState('');
  const [token, setToken] = useState('');
  const [origin, setOrigin] = useState('');
  const [lan, setLan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [details, setDetails] = useState(false);
  async function send(body: Record<string, unknown>): Promise<void> {
    setBusy(true);
    setFailure(undefined);
    try {
      const response = await fetch('./api/botharness/devices/private-tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, confirm: true }),
      });
      const result = (await response.json().catch(() => ({}))) as { code?: string };
      if (!response.ok) {
        setFailure(result.code ?? 'private-tunnel-failed');
        return;
      }
      setToken('');
      setStep('choose');
      await refresh();
    } catch {
      setFailure('private-tunnel-failed');
    } finally {
      setBusy(false);
    }
  }
  const failed = failure ? (
    <StatusBlock
      icon="info"
      tone="warning"
      title={t('privateTunnel.panel.failedTitle')}
      body={t('privateTunnel.refused', { code: failure })}
      data={{ 'data-private-tunnel-failure': failure }}
    />
  ) : null;

  if (status && status.state !== 'off') {
    const port = status.originPort === undefined ? undefined : String(status.originPort);
    const forward =
      status.state !== 'connected' &&
      port !== undefined &&
      (status.mode === 'named' || status.mode === 'ingress');
    const local = port === undefined ? undefined : `http://127.0.0.1:${port}`;
    let block: ReactElement;
    if (status.state === 'connected') {
      block = (
        <StatusBlock
          icon="check"
          tone="success"
          title={t('privateTunnel.panel.connectedTitle')}
          body={t('privateTunnel.connected')}
          action={
            <Button variant="primary" size="sm" onClick={pair}>
              {t('privateRelay.pair')}
            </Button>
          }
          data={{ 'data-private-tunnel': 'connected' }}
        >
          {status.origin ? chip(t, status.origin, 'data-private-tunnel-origin') : null}
        </StatusBlock>
      );
    } else if (forward) {
      block = (
        <StatusBlock
          icon="plug"
          tone="warning"
          title={t('privateTunnel.panel.forwardTitle')}
          body={
            status.mode === 'named'
              ? t('privateTunnel.namedService', { port: port! })
              : t(status.lan ? 'privateTunnel.ingressTargetLan' : 'privateTunnel.ingressTarget', {
                  port: port!,
                })
          }
          data={{ 'data-private-tunnel': status.state, 'data-private-tunnel-forward': '' }}
        >
          {status.mode === 'ingress' && status.lan ? null : chip(t, local!)}
          <p {...stylex.props(styles.meta)}>
            {status.state === 'error'
              ? t('privateTunnel.error', { issue: status.issue ?? 'unknown' })
              : t('privateTunnel.verifying')}
          </p>
        </StatusBlock>
      );
    } else if (status.state === 'error') {
      block = (
        <StatusBlock
          icon="info"
          tone="warning"
          title={t('privateTunnel.panel.errorTitle')}
          body={t('privateTunnel.error', { issue: status.issue ?? 'unknown' })}
          data={{ 'data-private-tunnel': 'error' }}
        >
          {status.probe ? (
            <p {...stylex.props(styles.meta)}>
              {t('privateTunnel.probe', { probe: status.probe })}
            </p>
          ) : null}
        </StatusBlock>
      );
    } else {
      block = (
        <StatusBlock
          icon="globe"
          tone="accent"
          title={t('privateTunnel.panel.startingTitle')}
          body={t(
            status.state === 'verifying' ? 'privateTunnel.verifying' : 'privateTunnel.starting',
          )}
          data={{ 'data-private-tunnel': status.state }}
        >
          <StepProgress
            label={t('privateTunnel.panel.steps')}
            steps={[
              t('privateTunnel.panel.stepStart'),
              t('privateTunnel.panel.stepCheck'),
              t('privateTunnel.panel.stepPair'),
            ]}
            step={status.state === 'verifying' ? 1 : 0}
          />
        </StatusBlock>
      );
    }
    return (
      <StatusStack title={t('privateTunnel.title')}>
        {block}
        {status.addressChanged ? (
          <StatusBlock
            icon="alarm-clock"
            tone="warning"
            title={t('privateTunnel.panel.changedTitle')}
            body={t('privateTunnel.addressChanged')}
            data={{ 'data-private-tunnel-changed': '' }}
          />
        ) : null}
        {failed}
        <StatusDisclosure
          icon="settings"
          title={t('privateTunnel.panel.manage')}
          hint={t('privateTunnel.panel.manageHint')}
          open={details}
          onToggle={() => setDetails(!details)}
          data={{ 'data-private-tunnel-manage': '' }}
        >
          <StatusFact label={t('privateTunnel.panel.mode')}>{t(modeTitle(status.mode))}</StatusFact>
          {status.origin && status.state !== 'connected' ? (
            <StatusFact label={t('privateTunnel.panel.address')}>
              <CopyChip
                value={status.origin}
                copyLabel={t('devices.route.copy')}
                copiedLabel={t('devices.pair.copied')}
                well
              />
            </StatusFact>
          ) : null}
          {status.probe && status.state === 'connected' ? (
            <StatusFact label={t('privateTunnel.panel.lastCheck')}>{status.probe}</StatusFact>
          ) : null}
          <StatusFact
            label={t('privateTunnel.panel.turnOff')}
            control={
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void send({ action: 'disable' })}
              >
                {t('privateTunnel.disable')}
              </Button>
            }
          >
            {t('privateTunnel.panel.turnOffHint')}
          </StatusFact>
        </StatusDisclosure>
      </StatusStack>
    );
  }

  if (step === 'ingress')
    return (
      <StatusStack title={t('privateTunnel.title')}>
        <StatusBlock
          icon="server"
          tone="accent"
          title={t('privateTunnel.ingressTitle')}
          body={t('privateTunnel.ingressHelp')}
          data={{ 'data-private-tunnel-setup': 'ingress' }}
        >
          <StepProgress
            label={t('privateTunnel.panel.steps')}
            steps={[
              t('privateTunnel.panel.ingressStepAddress'),
              t('privateTunnel.panel.stepForward'),
              t('privateTunnel.panel.stepCheck'),
            ]}
            step={0}
          />
          <div {...stylex.props(styles.form)}>
            <FieldStack>
              <TextField
                label={t('privateTunnel.ingressOrigin')}
                value={origin}
                onChange={setOrigin}
                autoComplete="off"
              />
            </FieldStack>
            <SettingsRow
              title={t('privateTunnel.ingressLan')}
              description={t('privateTunnel.ingressLanDescription')}
              control={
                <Switch
                  label={t('privateTunnel.ingressLan')}
                  checked={lan}
                  onChange={() => setLan(!lan)}
                />
              }
            />
            <Button
              variant="primary"
              disabled={busy || !origin.trim()}
              onClick={() => void send({ action: 'enable', mode: 'ingress', origin, lan })}
              {...stylex.props(styles.submit)}
            >
              {t(busy ? 'privateRelay.connecting' : 'privateTunnel.ingressEnable')}
            </Button>
          </div>
        </StatusBlock>
        {failed}
      </StatusStack>
    );

  if (step === 'named')
    return (
      <StatusStack title={t('privateTunnel.title')}>
        <StatusBlock
          icon="globe"
          tone="accent"
          title={t('privateTunnel.namedTitle')}
          body={t('privateTunnel.namedHelp')}
          data={{ 'data-private-tunnel-setup': 'named' }}
        >
          <StepProgress
            label={t('privateTunnel.panel.steps')}
            steps={[
              t('privateTunnel.panel.namedStepToken'),
              t('privateTunnel.panel.stepForward'),
              t('privateTunnel.panel.stepCheck'),
            ]}
            step={0}
          />
          <div {...stylex.props(styles.form)}>
            <FieldStack>
              <TextField
                label={t('privateTunnel.hostname')}
                value={hostname}
                onChange={setHostname}
                autoComplete="off"
              />
              <TextField
                label={t('privateTunnel.token')}
                value={token}
                onChange={setToken}
                type="password"
                autoComplete="off"
              />
            </FieldStack>
            <Button
              variant="primary"
              disabled={busy || !hostname.trim() || !token.trim()}
              onClick={() => void send({ action: 'enable', mode: 'named', hostname, token })}
              {...stylex.props(styles.submit)}
            >
              {t(busy ? 'privateRelay.connecting' : 'privateTunnel.namedEnable')}
            </Button>
          </div>
        </StatusBlock>
        {failed}
      </StatusStack>
    );

  return (
    <StatusStack title={t('privateTunnel.title')}>
      <StatusBlock
        icon="globe"
        tone="accent"
        title={t('privateTunnel.panel.offTitle')}
        body={t('privateTunnel.panel.offBody')}
        action={
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => void send({ action: 'enable', mode: 'quick' })}
          >
            {t('privateTunnel.panel.quickAction')}
          </Button>
        }
        data={{ 'data-private-tunnel': 'off' }}
      >
        <StepProgress
          label={t('privateTunnel.panel.steps')}
          steps={[
            t('privateTunnel.panel.stepStart'),
            t('privateTunnel.panel.stepCheck'),
            t('privateTunnel.panel.stepPair'),
          ]}
          step={0}
        />
        <p {...stylex.props(styles.meta)}>{t('privateTunnel.quickDescription')}</p>
      </StatusBlock>
      {failed}
      <StatusHeading>{t('privateTunnel.panel.other')}</StatusHeading>
      <ChoiceButton
        title={t('privateTunnel.namedTitle')}
        description={t('privateTunnel.namedDescription')}
        leading={<StatusBadge icon="globe" tone="neutral" />}
        disabled={busy}
        onClick={() => setStep('named')}
      />
      <ChoiceButton
        title={t('privateTunnel.ingressTitle')}
        description={t('privateTunnel.ingressDescription')}
        leading={<StatusBadge icon="server" tone="neutral" />}
        disabled={busy}
        onClick={() => setStep('ingress')}
      />
      <ChoiceButton
        title={t('privateTunnel.advancedTitle')}
        description={t('privateTunnel.advancedDescription')}
        leading={<StatusBadge icon="package" tone="neutral" />}
        disabled={busy}
        onClick={advanced}
      />
    </StatusStack>
  );
}
