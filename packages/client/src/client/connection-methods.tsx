import { type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { Icon } from './ds/icon.js';
import { IconButton } from './ds/icon-button.js';
import { ListCard, ListCardItem } from './ds/list-card.js';
import { StatusDisclosure, StatusHeading } from './ds/status-block.js';
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

const attributes = {
  anyNetwork: 'globe',
  sameWifi: 'wifi',
  noAccount: 'user',
  signIn: 'key-round',
  changes: 'refresh-cw',
  fixed: 'link',
  tailscale: 'shield-check',
  cloudflare: 'cloud',
  publicHttps: 'lock',
  server: 'server',
} satisfies Record<Attribute, string>;

const statuses = {
  ready: { icon: 'check', tone: 'success' },
  on: { icon: 'power', tone: 'info' },
  failing: { icon: 'triangle-alert', tone: 'warning' },
} as const;

function methodStatus(state: string | undefined, ready: boolean): MethodStatus | undefined {
  if (state === 'error') return 'failing';
  if (ready) return 'ready';
  return state && state !== 'off' ? 'on' : undefined;
}

export function ConnectionMethods({
  t,
  state,
}: {
  t: BotHarnessTranslate;
  state: ReturnType<typeof usePairedDevices>;
}): ReactElement {
  const { snapshot, routes, freshSnapshot, busy, setSetup, setTunnelStep, setError, startQuick } =
    state;
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
  const advancedActive = Boolean(
    tailscale ||
    (custom && 'enabled' in custom && custom.enabled) ||
    (custom && custom.state !== 'off') ||
    relay,
  );
  const { advancedDisclosure: disclosure, setAdvancedDisclosure } = state;
  const expanded = disclosure?.active === advancedActive ? disclosure.open : advancedActive;

  const tunnel = (step: 'choose' | 'named' | 'ingress'): void => {
    setTunnelStep(step);
    setSetup('private');
  };

  const row = (method: {
    title: string;
    icon: string;
    facts: readonly Attribute[];
    status?: MethodStatus | undefined;
    recommended?: boolean;
    select(): void;
  }): ReactElement => (
    <ListCardItem
      leading={<Icon name={method.icon} />}
      title={method.title}
      summary={
        <span {...stylex.props(styles.chips)}>
          {method.recommended ? (
            <Tag wrap tone="info" className={stylex.props(styles.chip).className}>
              <Icon name="sparkles" size={12} />
              {t('connections.tier.recommended')}
            </Tag>
          ) : null}
          {method.facts.map((fact) => (
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
      trailing={
        <IconButton
          aria-label={method.title}
          disabled={!freshSnapshot || busy !== undefined}
          onClick={() => {
            setError(false);
            method.select();
          }}
        >
          <Icon name="chevron-right" />
        </IconButton>
      }
    />
  );

  const recommended = t('connections.tier.recommended');
  const local = t('connections.tier.local');
  return (
    <div {...stylex.props(styles.group)} data-connection-methods="">
      <StatusHeading>{recommended}</StatusHeading>
      <ListCard label={recommended}>
        {row({
          title: t('connections.quick'),
          icon: 'zap',
          facts: ['anyNetwork', 'noAccount', 'changes'],
          status: methodStatus(
            quick?.state,
            quick?.origin !== undefined && routeReady('private', quick.origin),
          ),
          recommended: true,
          select: () => {
            if (!snapshot) return;
            if ((quick && quick.state !== 'off') || relay) tunnel('choose');
            else void startQuick(snapshot);
          },
        })}
        {row({
          title: 'Tobs Connect',
          icon: 'cloud',
          facts: ['anyNetwork', 'signIn', 'fixed'],
          status: methodStatus(snapshot?.connect?.state, routeReady('connect')),
          select: () => setSetup('connect'),
        })}
      </ListCard>
      <StatusHeading>{local}</StatusHeading>
      <ListCard label={local}>
        {row({
          title: t('connections.lan'),
          icon: 'wifi',
          facts: ['sameWifi', 'noAccount'],
          status: lan,
          select: () => {
            if (state.lanReady && !state.page) state.open();
            else setSetup('lan');
          },
        })}
      </ListCard>
      <StatusDisclosure
        icon="settings"
        title={t('connections.advancedMethods')}
        open={expanded}
        onToggle={() => setAdvancedDisclosure({ active: advancedActive, open: !expanded })}
        fullWidth
      >
        <ListCard label={t('connections.advancedMethods')}>
          {row({
            title: 'Tailscale',
            icon: 'shield-check',
            facts: ['anyNetwork', 'tailscale', 'fixed'],
            status: tailscale,
            select: () => setSetup('tailscale'),
          })}
          {row({
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
            select: () => tunnel(custom?.mode === 'named' ? 'choose' : 'named'),
          })}
          {row({
            title: t('connections.method.proxy'),
            icon: 'network',
            facts: ['anyNetwork', 'publicHttps', 'fixed'],
            status:
              custom?.mode === 'ingress'
                ? methodStatus(
                    custom.state,
                    custom.origin !== undefined && routeReady('private', custom.origin),
                  )
                : undefined,
            select: () => tunnel(custom?.mode === 'ingress' ? 'choose' : 'ingress'),
          })}
          {row({
            title: t('connections.method.relay'),
            icon: 'server',
            facts: ['anyNetwork', 'server', 'fixed'],
            status: relay,
            select: () => setSetup('privateRelay'),
          })}
        </ListCard>
      </StatusDisclosure>
    </div>
  );
}
