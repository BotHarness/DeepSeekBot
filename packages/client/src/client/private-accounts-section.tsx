import { useState, type ReactElement } from 'react';

import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import type { PrivateAccountSummary } from '../../../core/src/credentials/contracts.js';
import { useClientState } from './bot-sidebar.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { channelSettings } from './channel-settings-state.js';
import { formatRelativeTime } from './labels.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';
import type { PrivateAccountList } from './private-accounts.js';
import { PrivateInputCard } from './private-input-card.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; list: PrivateAccountList };

const STATUS_TONE = {
  configured: 'success',
  replacing: 'warning',
  unavailable: 'quiet',
} as const;

function PrivateAccountsPanel({ botSlug, actions, t }: ChannelSidebarEntryProps): ReactElement {
  const state = useClientState();
  const channel = state.conversation.channel;
  const revision =
    channel?.type === 'dm' && channel.botSlug === botSlug ? state.conversation.revision : undefined;
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  const mount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    if (botSlug === undefined || actions.privateAccounts === undefined) {
      setLoad({ status: 'error' });
      return undefined;
    }
    actions.privateAccounts(botSlug).then(
      (list) => {
        if (live) setLoad({ status: 'ready', list });
      },
      () => {
        if (live) setLoad({ status: 'error' });
      },
    );
    return () => {
      live = false;
    };
  }, [actions, botSlug, revision, reload]);

  const run = async (account: string, work: () => Promise<void>): Promise<void> => {
    if (busy !== undefined) return;
    setBusy(account);
    setFailed(false);
    setNotice(undefined);
    try {
      await work();
    } catch {
      setFailed(true);
    } finally {
      setBusy(undefined);
      setReload((value) => value + 1);
    }
  };

  const replace = (row: PrivateAccountSummary) =>
    run(row.account, async () => {
      await actions.privateInputReplace?.(row.channelId!, row.messageId!);
    });
  const remove = (row: PrivateAccountSummary) => {
    if (!window.confirm(t('privateAccounts.removeConfirm', { account: row.account }))) return;
    void run(row.account, async () => {
      const result = await actions.privateAccountRevoke?.(row.channelId!, row.messageId!);
      if (result !== undefined)
        setNotice(
          t('privateInput.stopSummary', {
            stopped: result.stopped,
            completed: result.completed,
            uncertain: result.uncertain,
          }),
        );
    });
  };
  const removeServer = (serverName: string) => {
    if (botSlug === undefined) return;
    if (!window.confirm(t('privateAccounts.mcpRemoveConfirm', { server: serverName }))) return;
    void run('mcp:' + serverName, async () => {
      await actions.privateMcpServerRemove?.(botSlug, serverName);
    });
  };
  const cancel = (row: PrivateAccountSummary) =>
    run(row.account, async () => {
      await actions.privateInputCancel?.(row.channelId!, row.replacementMessageId!);
    });
  const openRequest = (row: PrivateAccountSummary) => {
    channelSettings.close();
    void actions.openChannelAtMessage(row.channelId!, row.messageId!);
  };

  const now = Date.now();
  const statusLabel = {
    configured: t('privateAccounts.status.configured'),
    replacing: t('privateAccounts.status.replacing'),
    unavailable: t('privateAccounts.status.unavailable'),
  } as const;
  const replacementCard = (row: PrivateAccountSummary) => {
    const message = state.conversation.messages.find(
      (candidate) => candidate.id === row.replacementMessageId,
    );
    return message?.privateInputRequest === undefined ? null : (
      <PrivateInputCard message={message} actions={actions} t={t} />
    );
  };

  return (
    <div className="bh-private-accounts" ref={mount}>
      <div className="bh-note">{t('privateAccounts.note')}</div>
      {load.status === 'loading' ? (
        <LoadingSkeleton kind="sidebar" label={t('privateAccounts.loading')} />
      ) : null}
      {load.status === 'error' ||
      (load.status === 'ready' && load.list.status === 'unavailable') ? (
        <div role="alert" className="bh-error">
          {t('privateAccounts.unavailable')}
        </div>
      ) : null}
      {load.status === 'ready' &&
      load.list.status === 'ready' &&
      load.list.accounts.length === 0 ? (
        <div className="bh-note">{t('privateAccounts.empty')}</div>
      ) : null}
      {load.status === 'ready' && load.list.status === 'ready' && !load.list.replaceable ? (
        <div className="bh-note">{t('privateAccounts.locked')}</div>
      ) : null}
      {load.status === 'ready' && load.list.accounts.length > 0 ? (
        <SidebarCardList label={t('privateAccounts.title')}>
          {load.list.accounts.map((row) => {
            const located = row.channelId !== undefined && row.messageId !== undefined;
            const disabled = busy !== undefined;
            return (
              <SidebarCardRow
                key={row.account}
                icon="shield-check"
                title={row.account}
                state={row.status}
                chips={<Tag tone={STATUS_TONE[row.status]}>{statusLabel[row.status]}</Tag>}
                meta={
                  <>
                    {row.purpose === undefined ? null : (
                      <span className="bh-card-meta-line bh-private-account-purpose">
                        {t('privateAccounts.purpose', { purpose: row.purpose })}
                      </span>
                    )}
                    {row.fields.length === 0 ? null : (
                      <span className="bh-card-meta-line bh-private-account-fields">
                        {t('privateAccounts.fields', {
                          fields: row.fields
                            .map((field) =>
                              field.required
                                ? field.label
                                : t('privateAccounts.optional', { label: field.label }),
                            )
                            .join(' · '),
                        })}
                      </span>
                    )}
                    {row.configuredAt === undefined ? null : (
                      <span
                        className="bh-card-meta-line"
                        title={new Date(row.configuredAt).toLocaleString()}
                      >
                        {t('privateAccounts.setAt', {
                          time: formatRelativeTime(Date.parse(row.configuredAt), now, t),
                        })}
                      </span>
                    )}
                  </>
                }
                detail={
                  <div className="bh-private-account-actions">
                    {located ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={disabled}
                        onClick={() => openRequest(row)}
                      >
                        {t('privateAccounts.openRequest')}
                      </Button>
                    ) : null}
                    {row.status === 'configured' && located ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={disabled || !load.list.replaceable}
                        onClick={() => void replace(row)}
                      >
                        {t('privateInput.replace')}
                      </Button>
                    ) : null}
                    {row.status === 'replacing' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        onClick={() => void cancel(row)}
                      >
                        {t('privateAccounts.cancelReplace')}
                      </Button>
                    ) : null}
                    {located ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        onClick={() => remove(row)}
                      >
                        {t('privateAccounts.remove')}
                      </Button>
                    ) : null}
                    {row.status === 'replacing' ? replacementCard(row) : null}
                  </div>
                }
              />
            );
          })}
        </SidebarCardList>
      ) : null}
      {load.status === 'ready' && (load.list.mcpServers ?? []).length > 0 ? (
        <div className="bh-note">{t('privateAccounts.mcpTitle')}</div>
      ) : null}
      {load.status === 'ready' && (load.list.mcpServers ?? []).length > 0 ? (
        <SidebarCardList label={t('privateAccounts.mcpTitle')}>
          {(load.list.mcpServers ?? []).map((server) => (
            <SidebarCardRow
              key={server.serverName}
              icon="plug"
              title={server.serverName}
              state={server.connected ? 'connected' : 'stopped'}
              chips={
                <Tag tone={server.connected ? 'success' : 'quiet'}>
                  {t(
                    server.connected
                      ? 'privateAccounts.mcpConnected'
                      : 'privateAccounts.mcpStopped',
                  )}
                </Tag>
              }
              meta={
                <>
                  <span className="bh-card-meta-line">
                    {t('privateAccounts.mcpCommand', {
                      command: [server.program, ...server.args].join(' '),
                    })}
                  </span>
                  <span className="bh-card-meta-line">
                    {t('privateAccounts.mcpAccount', { account: server.account })}
                  </span>
                  <span
                    className="bh-card-meta-line"
                    title={new Date(server.approvedAt).toLocaleString()}
                  >
                    {t('privateAccounts.mcpApprovedAt', {
                      time: formatRelativeTime(Date.parse(server.approvedAt), now, t),
                    })}
                  </span>
                </>
              }
              detail={
                <div className="bh-private-account-actions">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy !== undefined}
                    onClick={() => removeServer(server.serverName)}
                  >
                    {t('privateAccounts.mcpRemove')}
                  </Button>
                </div>
              }
            />
          ))}
        </SidebarCardList>
      ) : null}
      {notice === undefined ? null : (
        <div role="status" className="bh-note">
          {notice}
        </div>
      )}
      {failed ? (
        <div role="alert" className="bh-error">
          {t('privateInput.error')}
        </div>
      ) : null}
    </div>
  );
}

export function PrivateAccountsSection(props: ChannelSidebarEntryProps): ReactElement {
  return <PrivateAccountsPanel key={props.botSlug ?? 'none'} {...props} />;
}
