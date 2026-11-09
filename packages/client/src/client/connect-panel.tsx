import { useState, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { ConnectAccountHosts } from './connect-account-hosts.js';
import { StepProgress } from './ds/step-progress.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';

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

type Tone = 'neutral' | 'accent' | 'success' | 'warning';

const styles = stylex.create({
  panel: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  heading: {
    margin: 0,
    paddingBottom: space.x1,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x4,
    padding: space.x4,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    minWidth: 0,
  },
  warningCard: { backgroundColor: color.warningSoft },
  head: { display: 'flex', alignItems: 'flex-start', gap: space.x3, minWidth: 0 },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '36px',
    height: '36px',
    borderRadius: radius.sm,
    backgroundColor: color.base,
    color: color.muted,
  },
  accent: { backgroundColor: color.accentTint, color: color.accent },
  success: { color: color.success },
  warning: { backgroundColor: color.base, color: color.warning },
  copy: { display: 'flex', flexDirection: 'column', gap: space.x1, flexGrow: 1, minWidth: 0 },
  title: {
    margin: 0,
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  body: { margin: 0, color: color.muted, fontSize: text.bodySize, lineHeight: text.bodyLine },
  action: { flexShrink: 0, display: 'flex', alignItems: 'center', gap: space.x2 },
  code: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: space.x3,
    padding: space.x4,
    borderRadius: radius.sm,
    backgroundColor: color.base,
  },
  codeValue: {
    fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)',
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
    letterSpacing: '0.08em',
    color: color.fg,
  },
  meta: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
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
  statValue: {
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
    fontVariantNumeric: 'tabular-nums',
  },
  meter: {
    height: '4px',
    borderRadius: radius.xs,
    backgroundColor: color.base,
    overflow: 'hidden',
  },
  meterFill: { height: '100%', backgroundColor: color.accent },
  meterFull: { backgroundColor: color.warning },
  disclosure: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    width: '100%',
    padding: space.x4,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.md,
    outlineWidth: { default: 0, ':focus-visible': border.focus },
    outlineStyle: 'solid',
    outlineColor: color.accent,
    backgroundColor: { default: color.surface, ':hover': color.hover },
    color: color.fg,
    cursor: 'pointer',
    textAlign: 'start',
    font: 'inherit',
  },
  chevron: { color: color.muted, transitionProperty: 'transform', transitionDuration: '120ms' },
  chevronOpen: { transform: 'rotate(90deg)' },
  details: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x4,
    paddingInline: space.x4,
    paddingBottom: space.x2,
  },
  pair: { display: 'flex', alignItems: 'center', gap: space.x3, minWidth: 0, flexWrap: 'wrap' },
  grow: { display: 'flex', flexDirection: 'column', gap: space.x1, flexGrow: 1, minWidth: 0 },
  label: { color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
  value: {
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    overflowWrap: 'anywhere',
  },
});

function Badge({ icon, tone }: { icon: string; tone: Tone }): ReactElement {
  return (
    <span
      aria-hidden="true"
      {...stylex.props(
        styles.badge,
        tone === 'accent' && styles.accent,
        tone === 'success' && styles.success,
        tone === 'warning' && styles.warning,
      )}
    >
      <ChannelSidebarIcon name={icon} size={18} />
    </span>
  );
}

function Card({
  icon,
  tone,
  title,
  body,
  action,
  warning = false,
  data,
  children,
}: {
  icon: string;
  tone: Tone;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  warning?: boolean;
  data?: Record<`data-${string}`, string>;
  children?: ReactNode;
}): ReactElement {
  return (
    <div {...data} {...stylex.props(styles.card, warning && styles.warningCard)}>
      <div {...stylex.props(styles.head)}>
        <Badge icon={icon} tone={tone} />
        <div {...stylex.props(styles.copy)}>
          <p {...stylex.props(styles.title)}>{title}</p>
          {body === undefined ? null : <div {...stylex.props(styles.body)}>{body}</div>}
        </div>
        {action === undefined ? null : <div {...stylex.props(styles.action)}>{action}</div>}
      </div>
      {children}
    </div>
  );
}

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
}: PropsLocale<'botharness'> & {
  account: ConnectAccountStatus;
  tunnel: ConnectTunnelStatus | undefined;
  fresh: boolean;
  busy: string | undefined;
  onAccount(action: 'sign-in' | 'sign-out'): void;
  reloadSnapshot(): Promise<unknown>;
}): ReactElement {
  const [manage, setManage] = useState(false);
  const waiting = account.state === 'error' && account.issue === 'relay-full';
  const linked = account.state === 'signed-in' || waiting;
  const pool = account.pool;
  const signInButton = (
    <Button
      variant="primary"
      size="sm"
      disabled={busy === 'sign-in'}
      onClick={() => onAccount('sign-in')}
    >
      {t('devices.connect.signIn')}
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
  if (account.state === 'signed-out') {
    status = (
      <Card
        icon="globe"
        tone="accent"
        title={t('devices.connect.panel.offTitle')}
        body={t('devices.connect.panel.offBody')}
        action={signInButton}
      >
        {steps(0)}
      </Card>
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
        {account.verificationUri === undefined ? null : (
          <div data-connect-code="" {...stylex.props(styles.code)}>
            <span {...stylex.props(styles.codeValue)}>{account.userCode}</span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => window.open(account.verificationUri, '_blank', 'noopener')}
            >
              {t('devices.connect.openPage')}
            </Button>
            <p data-connect-switch="" {...stylex.props(styles.meta)}>
              {t('devices.connect.switchAccount')} {account.verificationUri}
            </p>
          </div>
        )}
      </Card>
    );
  } else if (waiting) {
    status = (
      <Card
        icon="alarm-clock"
        tone="warning"
        warning
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
        warning
        title={t('devices.connect.panel.errorTitle')}
        body={<span data-connect-issue={account.issue ?? ''}>{t(issueKey(account))}</span>}
        action={account.recovery === 'automatic' ? undefined : signInButton}
      />
    );
  } else {
    const state = !fresh ? 'unknown' : (tunnel?.state ?? 'off');
    const full = pool !== undefined && pool.free === 0;
    status = (
      <Card
        icon={state === 'connected' ? 'check' : 'globe'}
        tone={state === 'connected' ? 'success' : state === 'error' ? 'warning' : 'neutral'}
        warning={state === 'error'}
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
    <div data-connect="" {...stylex.props(styles.panel)}>
      <h3 data-connect-account={account.state} {...stylex.props(styles.heading)}>
        {t('devices.connect.title')}
      </h3>
      {status}
      {linked ? (
        <>
          <button
            type="button"
            aria-expanded={manage}
            data-connect-manage=""
            onClick={() => setManage(!manage)}
            {...stylex.props(styles.disclosure)}
          >
            <Badge icon="user" tone="neutral" />
            <span {...stylex.props(styles.copy)}>
              <span {...stylex.props(styles.title)}>{t('devices.connect.panel.manage')}</span>
              <span {...stylex.props(styles.body)}>{t('devices.connect.panel.manageHint')}</span>
            </span>
            <span {...stylex.props(styles.chevron, manage && styles.chevronOpen)}>
              <ChannelSidebarIcon name="chevron-right" size={16} />
            </span>
          </button>
          {manage ? (
            <div {...stylex.props(styles.details)}>
              <div {...stylex.props(styles.pair)}>
                <div {...stylex.props(styles.grow)}>
                  <span {...stylex.props(styles.label)}>{t('devices.connect.account')}</span>
                  <span data-connect-email="" {...stylex.props(styles.value)}>
                    {account.email}
                  </span>
                </div>
                <span {...stylex.props(styles.label)}>{t('devices.connect.notYou')}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === 'sign-out'}
                  onClick={() => onAccount('sign-out')}
                >
                  {t('devices.connect.signOut')}
                </Button>
              </div>
              {tunnel?.hostname === undefined ? null : (
                <div data-connect-address="" {...stylex.props(styles.grow)}>
                  <span {...stylex.props(styles.label)}>{t('devices.connect.tunnel')}</span>
                  <span {...stylex.props(styles.value)}>{tunnel.hostname}</span>
                </div>
              )}
              <ConnectAccountHosts t={t} account={account} reloadSnapshot={reloadSnapshot} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
