import { useState, type ComponentProps, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { ConnectionGuide } from './connection-guide.js';
import { ChoiceButton } from './ds/choice-button.js';
import { FieldStack, TextField } from './ds/field.js';
import { SettingsRow } from './ds/settings-row.js';
import {
  CopyChip,
  StatusBadge,
  StatusBlock,
  StatusDisclosure,
  StatusFact,
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

function recoveryKey(reason: string | undefined) {
  if (reason === 'private-ingress-origin-invalid') return 'connections.recovery.address';
  if (reason === 'private-tunnel-hostname-invalid' || reason === 'private-tunnel-token-invalid')
    return 'connections.recovery.token';
  if (reason === 'private-route-origin-in-use') return 'privateTunnel.routes.originInUse';
  if (reason === 'private-route-in-use') return 'connections.recovery.busy';
  if (reason === 'dns') return 'connections.recovery.dns';
  if (reason === 'tls') return 'connections.recovery.tls';
  if (reason === 'timeout' || reason === 'tunnel-unreachable' || reason?.startsWith('http-'))
    return 'connections.recovery.forward';
  return 'connections.recovery.generic';
}

function PrivateTunnelRouteSettings({
  t,
  status,
  refresh,
  pair,
  advanced,
  step,
  setStep,
  routeId,
  replace = false,
  secondaryQuick = false,
}: PropsLocale<'botharness'> & {
  status?: PrivateTunnelView;
  routeId?: PrivateRouteView['id'];
  replace?: boolean;
  secondaryQuick?: boolean;
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
  const [otherMethods, setOtherMethods] = useState(false);
  async function send(body: Record<string, unknown>): Promise<void> {
    setBusy(true);
    setFailure(undefined);
    try {
      const response = await fetch('./api/botharness/devices/private-tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body,
          ...(body['action'] === 'enable'
            ? {
                action: replace ? 'replace' : 'add',
                routeId: body['mode'] === 'quick' ? 'quick' : 'custom',
              }
            : routeId
              ? { action: 'stop', routeId }
              : {}),
          confirm: true,
        }),
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
      body={t(recoveryKey(failure))}
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
          {status.mode === 'quick' ? (
            <p {...stylex.props(styles.meta)}>{t('privateTunnel.quickLifecycle')}</p>
          ) : null}
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
              ? t(recoveryKey(status.probe ?? status.issue))
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
          body={t(recoveryKey(status.probe ?? status.issue))}
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
        <ConnectionGuide t={t} method={status.mode === 'ingress' ? 'ingress' : 'named'} />
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
          body={t('connections.ingressRequirements')}
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
              {t(
                busy
                  ? 'privateRelay.connecting'
                  : replace
                    ? 'privateTunnel.routes.replaceConfirm'
                    : 'privateTunnel.ingressEnable',
              )}
            </Button>
          </div>
        </StatusBlock>
        {failed}
        <ConnectionGuide t={t} method="ingress" />
      </StatusStack>
    );

  if (step === 'named')
    return (
      <StatusStack title={t('privateTunnel.title')}>
        <StatusBlock
          icon="globe"
          tone="accent"
          title={t('privateTunnel.namedTitle')}
          body={t('connections.namedRequirements')}
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
              {t(
                busy
                  ? 'privateRelay.connecting'
                  : replace
                    ? 'privateTunnel.routes.replaceConfirm'
                    : 'privateTunnel.namedEnable',
              )}
            </Button>
          </div>
        </StatusBlock>
        {failed}
        <ConnectionGuide t={t} method="named" />
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
            variant={secondaryQuick ? 'outline' : 'primary'}
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
      <StatusDisclosure
        icon="settings"
        title={t('privateTunnel.panel.other')}
        hint={t('privateTunnel.otherHint')}
        open={otherMethods}
        onToggle={() => setOtherMethods(!otherMethods)}
      >
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
      </StatusDisclosure>
    </StatusStack>
  );
}

export interface PrivateRouteView extends PrivateTunnelView {
  id: 'quick' | 'custom';
  enabled: boolean;
}

export function PrivateTunnelSettings(
  props: ComponentProps<typeof PrivateTunnelRouteSettings> & {
    routes?: PrivateRouteView[];
    managementOnly?: boolean;
    fresh?: boolean;
  },
): ReactElement {
  const { t, routes, step, setStep, managementOnly = false, fresh = true } = props;
  const [selected, select] = useState<PrivateRouteView['id']>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [remove, setRemove] = useState<PrivateRouteView['id']>();
  async function change(action: 'start' | 'stop' | 'remove', routeId: PrivateRouteView['id']) {
    setBusy(true);
    setFailed(false);
    try {
      const result = await fetch('./api/botharness/devices/private-tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, routeId, confirm: true }),
      });
      if (!result.ok) {
        setFailed(true);
        return;
      }
      setRemove(undefined);
      await props.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  if (!routes?.length) return managementOnly ? <></> : <PrivateTunnelRouteSettings {...props} />;
  const current = routes.find((route) => route.id === selected);
  const custom = routes.find((route) => route.id === 'custom');
  return (
    <StatusStack title={t('privateTunnel.title')}>
      {!managementOnly &&
      step === 'choose' &&
      current?.state !== 'connected' &&
      routes.some((route) => route.state === 'connected') ? (
        <Button variant="primary" onClick={props.pair}>
          {t('privateRelay.pair')}
        </Button>
      ) : null}
      {routes.map((route) => (
        <StatusBlock
          key={route.id}
          title={t(modeTitle(route.mode))}
          icon={route.mode === 'quick' ? 'globe' : 'server'}
          tone={
            route.state === 'connected'
              ? 'success'
              : route.state === 'error'
                ? 'warning'
                : 'neutral'
          }
          body={route.origin ?? t(`privateTunnel.routes.${route.state}`)}
          action={
            <>
              <span>{t(`privateTunnel.routes.${route.state}`)}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !fresh}
                onClick={() => void change(route.enabled ? 'stop' : 'start', route.id)}
              >
                {t(route.enabled ? 'privateTunnel.routes.stop' : 'privateTunnel.routes.start')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !fresh}
                onClick={() => {
                  select(selected === route.id ? undefined : route.id);
                  setStep('choose');
                }}
              >
                {t('privateTunnel.panel.manage')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !fresh}
                onClick={() => setRemove(route.id)}
              >
                {t('privateTunnel.routes.remove')}
              </Button>
            </>
          }
        />
      ))}
      {failed ? (
        <StatusBlock
          icon="info"
          tone="warning"
          title={t('privateTunnel.panel.failedTitle')}
          body={t('connections.recovery.generic')}
        />
      ) : null}
      {remove ? (
        <StatusBlock
          icon="info"
          tone="warning"
          title={t('privateTunnel.routes.remove')}
          body={t('privateTunnel.routes.removeHint')}
          action={
            <>
              <Button variant="outline" disabled={busy} onClick={() => setRemove(undefined)}>
                {t('privateTunnel.routes.cancel')}
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void change('remove', remove)}
              >
                {t('privateTunnel.routes.removeConfirm')}
              </Button>
            </>
          }
        />
      ) : null}
      {current && step === 'choose' && current.state !== 'off' ? (
        <PrivateTunnelRouteSettings {...props} status={current} routeId={current.id} />
      ) : null}
      {managementOnly ? null : step !== 'choose' ? (
        <>
          {custom ? (
            <p {...stylex.props(styles.meta)}>{t('privateTunnel.routes.replaceHint')}</p>
          ) : null}
          <PrivateTunnelRouteSettings {...props} status={{ state: 'off' }} replace={!!custom} />
          <Button variant="outline" onClick={() => setStep('choose')}>
            {t('privateTunnel.routes.cancel')}
          </Button>
        </>
      ) : (
        <>
          {!routes.some((route) => route.id === 'quick') ? (
            <PrivateTunnelRouteSettings {...props} status={{ state: 'off' }} secondaryQuick />
          ) : (
            <>
              <ChoiceButton
                title={t(
                  custom ? 'privateTunnel.routes.replaceNamed' : 'privateTunnel.routes.addNamed',
                )}
                disabled={busy}
                onClick={() => {
                  select(undefined);
                  setStep('named');
                }}
              />
              <ChoiceButton
                title={t(
                  custom
                    ? 'privateTunnel.routes.replaceIngress'
                    : 'privateTunnel.routes.addIngress',
                )}
                disabled={busy}
                onClick={() => {
                  select(undefined);
                  setStep('ingress');
                }}
              />
            </>
          )}
        </>
      )}
    </StatusStack>
  );
}
