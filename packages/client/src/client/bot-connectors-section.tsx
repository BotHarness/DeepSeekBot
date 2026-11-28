import { useState, type ReactElement } from 'react';

import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { ConnectorMeta } from './connectors-settings.js';
import { Select } from './ds/select.js';
import type { ConnectorAccess, ConnectorsView } from './features/connectors/bridge.js';
import { ConnectorLogo } from './features/connectors/logos.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';

type Choice = ConnectorAccess | 'none' | 'once';

type Grants = {
  access: Record<string, ConnectorAccess>;
  once: Record<string, ConnectorAccess>;
};

type Load =
  | { status: 'loading' }
  | { status: 'denied' }
  | ({ status: 'ready'; view: ConnectorsView } & Grants);

function grantsOf(result: {
  connectors: ReadonlyArray<{ accountId: string; access: ConnectorAccess }>;
  once?: ReadonlyArray<{ accountId: string; access: ConnectorAccess }> | undefined;
}): Grants {
  return {
    access: Object.fromEntries(result.connectors.map((entry) => [entry.accountId, entry.access])),
    once: Object.fromEntries((result.once ?? []).map((entry) => [entry.accountId, entry.access])),
  };
}

function BotConnectorsPanel({ botSlug, actions, t }: ChannelSidebarEntryProps): ReactElement {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [busy, setBusy] = useState<string | undefined>();
  const [failed, setFailed] = useState<string | undefined>();
  const mount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    if (
      botSlug === undefined ||
      actions.connectors === undefined ||
      actions.botConnectors === undefined
    ) {
      setLoad({ status: 'denied' });
      return undefined;
    }
    Promise.all([actions.connectors(), actions.botConnectors(botSlug)]).then(
      ([view, granted]) => {
        if (!live) return;
        setLoad({ status: 'ready', view, ...grantsOf(granted) });
      },
      () => {
        if (live) setLoad({ status: 'denied' });
      },
    );
    return () => {
      live = false;
    };
  }, [actions, botSlug]);

  const change = async (accountId: string, choice: Choice) => {
    if (botSlug === undefined || load.status !== 'ready' || busy !== undefined) return;
    if (choice === 'once') return;
    setBusy(accountId);
    setFailed(undefined);
    try {
      const result = await actions.connectorGrantSet!(
        botSlug,
        accountId,
        choice === 'none' ? null : choice,
      );
      setLoad({ ...load, ...grantsOf(result) });
    } catch (error) {
      setFailed(t('connectors.error', { message: String(error) }));
    } finally {
      setBusy(undefined);
    }
  };

  if (load.status === 'loading')
    return (
      <div ref={mount}>
        <LoadingSkeleton kind="sidebar" label={t('entry.appConnectors')} />
      </div>
    );
  if (load.status === 'denied')
    return (
      <div ref={mount} className="bh-note">
        {t('connectors.bot.ownerOnly')}
      </div>
    );
  const options = [
    { value: 'none' as const, label: t('connectors.bot.none') },
    { value: 'read' as const, label: t('connectors.bot.read') },
    { value: 'write' as const, label: t('connectors.bot.write') },
  ];
  const useOptions = [
    { value: 'none' as const, label: t('connectors.bot.none') },
    { value: 'write' as const, label: t('connectors.bot.use') },
  ];
  const accounts = load.view.accounts.filter(
    (account) => account.holderSlug === undefined || account.holderSlug === botSlug,
  );
  return (
    <div ref={mount} data-bot-connectors="">
      {accounts.length === 0 ? (
        <div className="bh-note">{t('connectors.bot.empty')}</div>
      ) : (
        <SidebarCardList label={t('connectors.bot.title')}>
          {accounts.map((account) => {
            const remote = account.provider === 'mcp' && account.access !== undefined;
            const persistent = load.access[account.accountId];
            const once = persistent === undefined ? load.once[account.accountId] : undefined;
            const onceOption =
              once === undefined
                ? []
                : [
                    {
                      value: 'once' as const,
                      label: t('connectors.bot.onceAccess', {
                        access: t(once === 'read' ? 'connectors.bot.read' : 'connectors.bot.write'),
                      }),
                    },
                  ];
            return (
              <SidebarCardRow
                key={account.accountId}
                leading={
                  <ConnectorLogo
                    service={account.service}
                    size={28}
                    logos={actions.connectorLogos}
                  />
                }
                title={
                  account.label === account.name
                    ? account.name
                    : `${account.name} · ${account.label}`
                }
                meta={
                  <span className="bh-card-meta-line">
                    <ConnectorMeta
                      status={account.status}
                      identity={account.identity}
                      extra={
                        [
                          account.holderSlug === botSlug ? t('connectors.bot.own') : undefined,
                          account.access !== undefined
                            ? t(
                                account.access === 'read'
                                  ? 'connectors.bot.read'
                                  : 'connectors.bot.write',
                              )
                            : undefined,
                        ]
                          .filter((part) => part !== undefined)
                          .join(' · ') || undefined
                      }
                      t={t}
                    />
                  </span>
                }
                trailing={
                  <Select<Choice>
                    label={t('connectors.bot.title')}
                    value={
                      once !== undefined
                        ? 'once'
                        : persistent === undefined
                          ? 'none'
                          : remote
                            ? 'write'
                            : persistent
                    }
                    options={[...(remote ? useOptions : options), ...onceOption]}
                    disabled={busy !== undefined}
                    onChange={(choice) => void change(account.accountId, choice)}
                  />
                }
              />
            );
          })}
        </SidebarCardList>
      )}
      {failed === undefined ? null : (
        <div role="alert" className="bh-error">
          {failed}
        </div>
      )}
    </div>
  );
}

export function BotConnectorsSection(props: ChannelSidebarEntryProps): ReactElement {
  return <BotConnectorsPanel key={props.botSlug ?? 'none'} {...props} />;
}
