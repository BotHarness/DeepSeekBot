import { type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { Icon } from './ds/icon.js';
import { ListCard, ListCardItem } from './ds/list-card.js';
import { StatusHeading } from './ds/status-block.js';
import { Tag } from './ds/tag.js';
import { space } from './ds/tobs.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { quickRoute, type usePairedDevices } from './use-paired-devices.js';

const styles = stylex.create({
  group: { display: 'grid', gap: space.x2, minWidth: 0 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: space.x1, paddingBlockStart: space.x1 },
  chip: { gap: space.x1, minWidth: 0 },
});

type MethodStatus = 'ready' | 'on' | 'failing';
type Attribute =
  | 'anyNetwork'
  | 'sameWifi'
  | 'noAccount'
  | 'signIn'
  | 'changes'
  | 'fixed'
  | 'tailscale'
  | 'cloudflare'
  | 'publicHttps'
  | 'server';

interface ConnectionMethod {
  title: string;
  icon: string;
  facts: readonly Attribute[];
  status?: MethodStatus | undefined;
  recommended?: boolean;
  select(): void;
}

const attributes = {
  anyNetwork: 'globe',
  sameWifi: 'house',
  noAccount: 'user',
  signIn: 'id-card',
  changes: 'refresh-cw',
  fixed: 'link',
  tailscale: 'shield-check',
  cloudflare: 'id-card',
  publicHttps: 'lock',
  server: 'server',
} satisfies Record<Attribute, string>;

const statuses = {
  ready: { icon: 'check', tone: 'success' },
  on: { icon: 'play', tone: 'info' },
  failing: { icon: 'info', tone: 'warning' },
} as const;

function methodStatus(state: string | undefined, ready: boolean): MethodStatus | undefined {
  if (state === 'error') return 'failing';
  if (ready) return 'ready';
  return state && state !== 'off' ? 'on' : undefined;
}

export function ConnectionMethods({
  t,
  state,
  management = false,
}: {
  t: BotHarnessTranslate;
  state: ReturnType<typeof usePairedDevices>;
  management?: boolean;
}): ReactElement {
  const { snapshot, routes, freshSnapshot, busy, setSetup, setTunnelStep, setError } = state;
  const quick = quickRoute(snapshot);
  const custom =
    snapshot?.privateRoutes?.find((route) => route.id === 'custom') ??
    (snapshot?.privateTunnel?.mode === 'quick' ? undefined : snapshot?.privateTunnel);
  const routeReady = (kind: 'private' | 'connect', origin?: string): boolean =>
    freshSnapshot &&
    routes?.routes.some(
      (route) =>
        route.kind === kind && route.ready && (origin === undefined || route.url === origin),
    ) === true;
  const lan = methodStatus(snapshot?.lan?.state, freshSnapshot && state.lanReady);
  const tailscale = state.tailscaleReady
    ? 'ready'
    : routes?.managed?.enabled || routes?.managed?.owned
      ? routes.tailscale === 'running'
        ? 'on'
        : 'failing'
      : undefined;
  const relay = methodStatus(
    snapshot?.privateRelay?.state,
    snapshot?.privateRelay?.origin !== undefined &&
      routeReady('private', snapshot.privateRelay.origin),
  );
  const tunnel = (step: 'named' | 'ingress'): void => {
    setTunnelStep(step);
    setSetup('private');
  };

  const recommended: ConnectionMethod[] = [
    {
      title: t('connections.quick'),
      icon: 'zap',
      facts: ['anyNetwork', 'noAccount', 'changes'],
      status: methodStatus(
        quick?.state,
        quick?.origin !== undefined && routeReady('private', quick.origin),
      ),
      recommended: true,
      select: () => setSetup('quickStart'),
    },
    {
      title: 'Tobs Connect',
      icon: 'plug',
      facts: ['anyNetwork', 'signIn', 'fixed'],
      status: methodStatus(snapshot?.connect?.state, routeReady('connect')),
      select: () => setSetup('connect'),
    },
    {
      title: t('connections.lan'),
      icon: 'house',
      facts: ['sameWifi', 'noAccount'],
      status: lan,
      select: () => {
        if (state.lanReady && state.preparingRelationshipRoute.current) state.open();
        else setSetup('lan');
      },
    },
  ];
  const advanced: ConnectionMethod[] = [
    {
      title: 'Tailscale',
      icon: 'shield-check',
      facts: ['anyNetwork', 'tailscale', 'fixed'],
      status: tailscale,
      select: () => setSetup('tailscale'),
    },
    {
      title: t('connections.method.domain'),
      icon: 'globe',
      facts: ['anyNetwork', 'cloudflare', 'fixed'],
      status:
        custom?.mode === 'named'
          ? methodStatus(
              custom.state,
              custom.origin !== undefined && routeReady('private', custom.origin),
            )
          : undefined,
      select: () => tunnel('named'),
    },
    {
      title: t('connections.method.proxy'),
      icon: 'git-branch',
      facts: ['anyNetwork', 'publicHttps', 'fixed'],
      status:
        custom?.mode === 'ingress'
          ? methodStatus(
              custom.state,
              custom.origin !== undefined && routeReady('private', custom.origin),
            )
          : undefined,
      select: () => tunnel('ingress'),
    },
    {
      title: t('connections.method.relay'),
      icon: 'server',
      facts: ['anyNetwork', 'server', 'fixed'],
      status: relay,
      select: () => setSetup('privateRelay'),
    },
  ];
  const row = (method: ConnectionMethod): ReactElement => (
    <ListCardItem
      key={method.title}
      leading={<Icon name={method.icon} />}
      title={method.title}
      summary={
        <span {...stylex.props(styles.chips)}>
          {!management && method.recommended ? (
            <Tag wrap tone="info" className={stylex.props(styles.chip).className}>
              <Icon name="sparkles" size={12} />
              {t('connections.tier.recommended')}
            </Tag>
          ) : null}
          {management
            ? null
            : method.facts.map((fact) => (
                <Tag key={fact} wrap className={stylex.props(styles.chip).className}>
                  <Icon name={attributes[fact]} size={12} />
                  {t(`connections.attribute.${fact}`)}
                </Tag>
              ))}
          {method.status ? (
            <Tag
              wrap
              tone={statuses[method.status].tone}
              className={stylex.props(styles.chip).className}
            >
              <Icon name={statuses[method.status].icon} size={12} />
              {t(`connections.methodStatus.${method.status}`)}
            </Tag>
          ) : null}
        </span>
      }
      trailing={<Icon name="chevron-right" />}
      action={{
        label: management ? t('connections.manageMethod', { name: method.title }) : method.title,
        disabled: !freshSnapshot || busy !== undefined,
        onClick: () => {
          setError(false);
          method.select();
        },
      }}
    />
  );

  if (management) {
    const active = [...recommended, ...advanced].filter((method) => method.status);
    const title = t('connections.activeRoutes');
    return (
      <>
        <StatusHeading>{title}</StatusHeading>
        <ListCard label={title}>
          {active.length ? (
            active.map(row)
          ) : (
            <ListCardItem title={t('connections.noActiveRoutes')} />
          )}
        </ListCard>
      </>
    );
  }

  return (
    <div {...stylex.props(styles.group)} data-connection-methods="">
      <StatusHeading>{t('connections.tier.recommended')}</StatusHeading>
      <ListCard label={t('connections.tier.recommended')}>{recommended.map(row)}</ListCard>
      <StatusHeading>{t('connections.tier.advanced')}</StatusHeading>
      <ListCard label={t('connections.tier.advanced')}>{advanced.map(row)}</ListCard>
    </div>
  );
}
