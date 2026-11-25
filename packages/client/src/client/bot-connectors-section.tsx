import { useState, type ReactElement } from 'react';

import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { ConnectorMeta } from './connectors-settings.js';
import { BrandLogo } from './ds/brand-logo.js';
import { Select } from './ds/select.js';
import type { ConnectorAccess, ConnectorsView } from './features/connectors/bridge.js';
import { connectorLogo } from './ds/brand-logos.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';

type Choice = ConnectorAccess | 'none';

type Load =
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'ready'; view: ConnectorsView; access: Record<string, ConnectorAccess> };

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
        setLoad({
          status: 'ready',
          view,
          access: Object.fromEntries(
            granted.connectors.map((connector) => [connector.accountId, connector.access]),
          ),
        });
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
    setBusy(accountId);
    setFailed(undefined);
    try {
      const result = await actions.connectorGrantSet!(
        botSlug,
        accountId,
        choice === 'none' ? null : choice,
      );
      setLoad({
        ...load,
        access: Object.fromEntries(
          result.connectors.map((connector) => [connector.accountId, connector.access]),
        ),
      });
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
  return (
    <div ref={mount} data-bot-connectors="">
      {load.view.accounts.length === 0 ? (
        <div className="bh-note">{t('connectors.bot.empty')}</div>
      ) : (
        <SidebarCardList label={t('connectors.bot.title')}>
          {load.view.accounts.map((account) => (
            <SidebarCardRow
              key={account.accountId}
              leading={<BrandLogo src={connectorLogo(account.service)} size={28} />}
              title={
                account.label === account.name ? account.name : `${account.name} · ${account.label}`
              }
              meta={
                <span className="bh-card-meta-line">
                  <ConnectorMeta status={account.status} identity={account.identity} t={t} />
                </span>
              }
              trailing={
                <Select<Choice>
                  label={t('connectors.bot.title')}
                  value={load.access[account.accountId] ?? 'none'}
                  options={options}
                  disabled={busy !== undefined}
                  onChange={(choice) => void change(account.accountId, choice)}
                />
              }
            />
          ))}
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
