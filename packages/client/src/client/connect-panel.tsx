import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import { ConnectAccountHosts } from './connect-account-hosts.js';
import { ConnectSignInBlock } from './connect-sign-in-block.js';
import { StepProgress } from './ds/step-progress.js';
import {
  CopyChip,
  StatusBlock as Card,
  StatusDisclosure,
  StatusFact,
  StatusHeading,
  StatusStack,
} from './ds/status-block.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';

export interface ConnectPool {
  capacity: number;
  inUse: number;
  free: number;
  waiting: number;
  nextFreeAt?: string;
  guaranteedMinutes?: number;
}

export interface ConnectAccountStatus {
  state: 'signed-out' | 'signing-in' | 'signed-in' | 'error';
  email?: string;
  hostId?: string;
  userCode?: string;
  verificationUri?: string;
  issue?: string;
  recovery?: 'automatic' | 'sign-in';
  pool?: ConnectPool;
  wait?: { reason: 'pool-full' | 'zone-full' | 'queued'; position: number; since: string };
  protectedUntil?: string;
}

export interface ConnectTunnelStatus {
  state: 'off' | 'starting' | 'connected' | 'error';
  hostname?: string;
}

const styles = stylex.create({
  meta: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
  body: { margin: 0, color: color.muted, fontSize: text.bodySize, lineHeight: text.bodyLine },
  stats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: space.x2,
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    padding: space.x3,
    borderRadius: radius.sm,
    backgroundColor: color.base,
    minWidth: 0,
  },
  label: { color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
  statValue: {
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
    fontVariantNumeric: 'tabular-nums',
  },
  grow: { display: 'flex', flexDirection: 'column', gap: space.x1, flexGrow: 1, minWidth: 0 },
  meter: {
    height: '4px',
    borderRadius: radius.xs,
    backgroundColor: color.base,
    overflow: 'hidden',
  },
  meterFill: { height: '100%', backgroundColor: color.accent },
  meterFull: { backgroundColor: color.warning },
});

function Stat({ label, value, data }: { label: string; value: string; data?: string }) {
  return (
    <div {...(data === undefined ? {} : { [data]: '' })} {...stylex.props(styles.stat)}>
      <span {...stylex.props(styles.label)}>{label}</span>
      <span {...stylex.props(styles.statValue)}>{value}</span>
    </div>
  );
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

function issueKey(account: ConnectAccountStatus) {
  const issue = account.issue;
  if (issue === 'account-not-allowed') return 'devices.connect.notAllowed';
  if (issue === 'host-limit') return 'devices.connect.hostLimit';
  if (issue === 'session-revoked') return 'devices.connect.sessionRevoked';
  if (issue === 'session-expired' || issue === 'sign-in-expired' || issue === 'sign-in-denied')
    return 'devices.connect.signInAgain';
  if (issue === 'credential-unavailable') return 'devices.connect.credentialUnavailable';
  if (account.recovery === 'automatic') return 'devices.connect.relayDown';
  return 'devices.connect.relaySignIn';
}

export function ConnectPanel({
  t,
  account,
  tunnel,
  fresh,
  busy,
  onAccount,
  reloadSnapshot,
  signInLabel,
}: PropsLocale<'botharness'> & {
  account: ConnectAccountStatus;
  tunnel: ConnectTunnelStatus | undefined;
  fresh: boolean;
  busy: string | undefined;
  onAccount(action: 'sign-in' | 'sign-out'): void;
  reloadSnapshot(): Promise<unknown>;
  signInLabel?: string;
}): ReactElement {
  const [manage, setManage] = useState<boolean>();
  const manageOpen = manage ?? account.issue === 'host-limit';
  const waiting = account.state === 'error' && account.issue === 'relay-full';
  const linked = account.state === 'signed-in' || waiting || account.issue === 'host-limit';
  const pool = account.pool;
  const signInButton = (
    <Button
      variant="primary"
      size="sm"
      disabled={busy === 'sign-in'}
      onClick={() => onAccount('sign-in')}
    >
      {signInLabel ?? t('devices.connect.signIn')}
    </Button>
  );
  const steps = (step: number) => (
    <StepProgress
      label={t('devices.connect.panel.steps')}
      steps={[
        t('devices.connect.panel.stepSignIn'),
        t('devices.connect.panel.stepConfirm'),
        t('devices.connect.panel.stepReady'),
      ]}
      step={step}
    />
  );
  const meter =
    pool === undefined ? null : (
      <div data-connect-pool="" {...stylex.props(styles.grow)}>
        <span {...stylex.props(styles.meta)}>{t('devices.connect.pool', { ...pool })}</span>
        <div
          role="meter"
          aria-label={t('devices.connect.panel.poolLabel')}
          aria-valuemin={0}
          aria-valuemax={pool.capacity}
          aria-valuenow={pool.inUse}
          {...stylex.props(styles.meter)}
        >
          <div
            {...stylex.props(styles.meterFill, pool.free === 0 && styles.meterFull)}
            style={{
              width: `${String(pool.capacity === 0 ? 100 : Math.min(100, (pool.inUse / pool.capacity) * 100))}%`,
            }}
          />
        </div>
      </div>
    );
  const rule = (
    <p {...stylex.props(styles.meta)}>
      {t('devices.connect.poolRule', { minutes: pool?.guaranteedMinutes ?? 30 })}
    </p>
  );

  let status: ReactElement;
  if (
    account.state === 'signed-out' ||
    (account.state === 'signing-in' &&
      account.userCode !== undefined &&
      account.verificationUri !== undefined)
  ) {
    status = (
      <ConnectSignInBlock
        t={t}
        code={
          account.state === 'signing-in'
            ? { userCode: account.userCode!, verificationUri: account.verificationUri! }
            : undefined
        }
        title={t('devices.connect.panel.offTitle')}
        body={t('devices.connect.panel.offBody')}
        signInLabel={signInLabel ?? t('devices.connect.signIn')}
        busy={busy === 'sign-in'}
        onSignIn={() => onAccount('sign-in')}
      />
    );
  } else if (account.state === 'signing-in') {
    status = (
      <Card
        icon="lock"
        tone="accent"
        title={t('devices.connect.panel.confirmTitle')}
        body={t('devices.connect.confirm')}
      >
        {steps(1)}
      </Card>
    );
  } else if (waiting) {
    status = (
      <Card
        icon="alarm-clock"
        tone="warning"
        title={t('devices.connect.full.title')}
        body={
          account.wait?.reason === 'zone-full'
            ? t('devices.connect.full.zone')
            : account.wait === undefined
              ? t('devices.connect.relayDown')
              : t('devices.connect.full.queued', { position: account.wait.position })
        }
        data={{ 'data-connect-wait': account.wait?.reason ?? 'pool-full' }}
      >
        <div {...stylex.props(styles.stats)}>
          {account.wait === undefined ? null : (
            <Stat
              label={t('devices.connect.panel.place')}
              value={t('devices.connect.panel.placeValue', { position: account.wait.position })}
            />
          )}
          {pool?.nextFreeAt === undefined ? null : (
            <Stat
              label={t('devices.connect.panel.eta')}
              value={clock(pool.nextFreeAt)}
              data="data-connect-eta"
            />
          )}
          {account.wait === undefined ? null : (
            <Stat label={t('devices.connect.panel.since')} value={clock(account.wait.since)} />
          )}
        </div>
        {meter}
        {rule}
      </Card>
    );
  } else if (account.state === 'error') {
    status = (
      <Card
        icon="info"
        tone="warning"
        title={t('devices.connect.panel.errorTitle')}
        body={<span data-connect-issue={account.issue ?? ''}>{t(issueKey(account))}</span>}
        action={
          account.recovery === 'automatic' || account.issue === 'host-limit'
            ? undefined
            : signInButton
        }
      />
    );
  } else {
    const state = !fresh ? 'unknown' : (tunnel?.state ?? 'off');
    const full = pool !== undefined && pool.free === 0;
    status = (
      <Card
        icon={state === 'connected' ? 'check' : 'globe'}
        tone={state === 'connected' ? 'success' : state === 'error' ? 'warning' : 'neutral'}
        title={t(
          state === 'unknown'
            ? 'devices.connection.unchecked'
            : state === 'connected'
              ? 'devices.connect.connected'
              : state === 'error'
                ? 'devices.connect.reconnecting'
                : 'devices.connect.starting',
        )}
        body={t(
          state === 'error' ? 'devices.connect.recovery' : 'devices.connect.panel.connectedBody',
        )}
        data={{ 'data-connect-tunnel': state }}
      >
        {meter}
        {full && account.protectedUntil !== undefined ? (
          <p data-connect-protected="" {...stylex.props(styles.body)}>
            {t('devices.connect.protected', { time: clock(account.protectedUntil) })}
          </p>
        ) : null}
        {full ? rule : null}
      </Card>
    );
  }

  return (
    <StatusStack data={{ 'data-connect': '' }}>
      <StatusHeading data={{ 'data-connect-account': account.state }}>
        {t('devices.connect.title')}
      </StatusHeading>
      {status}
      {linked ? (
        <StatusDisclosure
          icon="user"
          title={t('devices.connect.panel.manage')}
          hint={t('devices.connect.panel.manageHint')}
          open={manageOpen}
          onToggle={() => setManage(!manageOpen)}
          data={{ 'data-connect-manage': '' }}
        >
          <StatusFact
            label={t('devices.connect.account')}
            control={
              <>
                <span {...stylex.props(styles.label)}>{t('devices.connect.notYou')}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === 'sign-out'}
                  onClick={() => onAccount('sign-out')}
                >
                  {t('devices.connect.signOut')}
                </Button>
              </>
            }
          >
            <span data-connect-email="">{account.email}</span>
          </StatusFact>
          {tunnel?.hostname === undefined ? null : (
            <StatusFact label={t('devices.connect.tunnel')} data={{ 'data-connect-address': '' }}>
              <CopyChip
                value={tunnel.hostname}
                copyLabel={t('devices.connect.copyLink')}
                copiedLabel={t('devices.connect.copied')}
                well
              />
            </StatusFact>
          )}
          <ConnectAccountHosts t={t} account={account} reloadSnapshot={reloadSnapshot} />
        </StatusDisclosure>
      ) : null}
    </StatusStack>
  );
}
