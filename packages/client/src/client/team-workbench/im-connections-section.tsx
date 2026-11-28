import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import type { MessagingConnectionsView } from '@botharness/host-protocol/messaging-connections';
import { readMessagingConnections } from '@botharness/host-client/messaging';
import type { BridgeActions } from '../actions.js';
import { bridgeHost, type BridgeCall } from '../bridge.js';
import { externalPlatformLabel } from '../bridge-source-label.js';
import { channelSettings } from '../channel-settings-state.js';
import { Combobox } from '../combobox.js';
import { BrandLogo } from '../ds/brand-logo.js';
import { connectorLogo } from '../ds/brand-logos.js';
import { Button } from '../ds/button.js';
import { PanelEmptyState } from '../ds/empty-state.js';
import { Field } from '../ds/field.js';
import { FormDialog } from '../ds/form-dialog.js';
import { Icon } from '../ds/icon.js';
import { IconButton } from '../ds/icon-button.js';
import { NavGroupHeading, NavItem } from '../ds/nav-item.js';
import { Note } from '../ds/note.js';
import { SettingsRow, SettingsSection, SettingsValue } from '../ds/settings-row.js';
import { Tag } from '../ds/tag.js';
import { space } from '../ds/tobs.stylex.js';
import { Tooltip } from '../ds/tooltip.js';
import type { BotHarnessTranslate } from '../locale.js';
import { useMountedResource } from '../mounted-resource.js';
import { BotBindingDialog } from '../onboarding-binding.js';
import { ReceptionStatus } from '../reception-status.js';
import { sameBotNames, useClientStore } from '../use-client-store.js';
import { DetailColumn, EmptyDetail, ListColumn, PanelGap } from './frame.js';
import { connectionStatus, groupByBot } from './im-connection-model.js';

export const BOT_IM_SETTINGS_ENTRY = 'external-identities';

const styles = stylex.create({
  contents: { display: 'contents' },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
});

type Dialog = { kind: 'pick'; botSlug: string } | { kind: 'bind'; botSlug: string };

export function ImConnectionsSection({
  call,
  t,
  actions,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  actions: BridgeActions;
}): ReactElement {
  const [view, setView] = useState<MessagingConnectionsView>();
  const [failed, setFailed] = useState(false);
  const [statusFailed, setStatusFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<Dialog>();
  const [opening, setOpening] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  const bots = useClientStore(
    (state) => state.bots.filter((bot) => bot.deleted !== true && bot.paused !== true),
    sameBotNames,
  );

  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const host = bridgeHost(call, signal);
    void readMessagingConnections(host, 'saved')
      .then(async (saved) => {
        if (signal.aborted) return;
        setView(saved);
        setFailed(false);
        try {
          const checked = await readMessagingConnections(host, 'status');
          if (signal.aborted) return;
          setView(checked);
          setStatusFailed(false);
        } catch {
          if (!signal.aborted) setStatusFailed(true);
        }
      })
      .catch(() => {
        if (!signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [call, attempt]);

  const reload = (): void => {
    setFailed(false);
    setAttempt((value) => value + 1);
  };

  const rows = view?.bindings ?? [];
  const needle = query.trim().toLocaleLowerCase();
  const platform = (value: string): string => externalPlatformLabel(value, t);
  const shown = rows.filter(
    (row) =>
      needle === '' ||
      [row.name, row.botName, platform(row.platform)].some((text) =>
        text.toLocaleLowerCase().includes(needle),
      ),
  );
  const groups = groupByBot(shown);
  const ordered = groups.flatMap((group) => group.rows);
  const connection = ordered.find((row) => row.id === selected) ?? ordered[0];
  const checks = view?.checks ?? 'pending';

  const openSettings = async (botSlug: string): Promise<void> => {
    setOpening(true);
    setOpenFailed(false);
    try {
      await actions.openBot(botSlug);
      channelSettings.open(BOT_IM_SETTINGS_ENTRY);
    } catch {
      setOpenFailed(true);
    } finally {
      setOpening(false);
    }
  };

  const startAdd = (): void => {
    const preferred = connection?.botSlug;
    setDialog({
      kind: 'pick',
      botSlug: bots.some((bot) => bot.slug === preferred) ? (preferred ?? '') : '',
    });
  };

  const logo = (value: string, size: number): ReactElement => (
    <BrandLogo src={connectorLogo(value)} size={size} fallbackIcon="messages-square" />
  );

  return (
    <div ref={mount} {...stylex.props(styles.contents)} data-panel-columns="">
      <ListColumn
        title={t('team.imConnections.title')}
        count={view === undefined ? undefined : rows.length}
        action={
          <Tooltip label={t('team.imConnections.add')}>
            <IconButton
              aria-label={t('team.imConnections.add')}
              disabled={bots.length === 0}
              data-im-connection-add=""
              onClick={startAdd}
            >
              <Icon name="plus" />
            </IconButton>
          </Tooltip>
        }
        search={{ label: t('team.imConnections.search'), value: query, onChange: setQuery }}
        status={
          failed ? (
            <Note tone="danger">
              {t('team.error.load')}
              <Button size="sm" variant="outline" data-im-connections-retry="" onClick={reload}>
                {t('team.workbench.retry')}
              </Button>
            </Note>
          ) : view === undefined ? (
            <PanelEmptyState icon="messages-square">{t('team.workbench.loading')}</PanelEmptyState>
          ) : rows.length === 0 ? (
            <PanelEmptyState icon="messages-square">
              {t('team.imConnections.empty')}
            </PanelEmptyState>
          ) : shown.length === 0 ? (
            <Note>{t('team.workbench.noMatch')}</Note>
          ) : statusFailed ? (
            <Note tone="warning">
              {t('team.imConnections.statusFailed')}
              <Button size="sm" variant="outline" data-im-connections-retry="" onClick={reload}>
                {t('team.workbench.retry')}
              </Button>
            </Note>
          ) : undefined
        }
      >
        {groups.map((group, index) => (
          <li key={group.botSlug} data-im-connection-bot={group.botSlug}>
            <NavGroupHeading
              first={index === 0}
              label={group.botName}
              trailing={String(group.rows.length)}
            />
            <ul role="list" aria-label={group.botName} {...stylex.props(styles.group)}>
              {group.rows.map((row) => {
                const status = connectionStatus(row, checks);
                return (
                  <li key={row.id}>
                    <NavItem
                      icon={logo(row.platform, 20)}
                      label={row.name}
                      description={platform(row.platform)}
                      multiline
                      trailing={<Tag tone={status.tone}>{t(status.label)}</Tag>}
                      current={row.id === connection?.id}
                      data={{ 'data-im-connection': row.id, 'data-im-status': status.label }}
                      onSelect={() => {
                        setSelected(row.id);
                        setOpenFailed(false);
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ListColumn>
      <PanelGap />
      {connection === undefined ? (
        <EmptyDetail icon="messages-square">
          {view !== undefined && rows.length === 0
            ? t('team.imConnections.emptyDetail')
            : t('team.imConnections.pick')}
        </EmptyDetail>
      ) : (
        <DetailColumn
          icon={logo(connection.platform, 24)}
          title={connection.name}
          meta={(() => {
            const status = connectionStatus(connection, checks);
            return <Tag tone={status.tone}>{t(status.label)}</Tag>;
          })()}
          action={
            connection.canOpenSettings ? (
              <Button
                size="sm"
                variant="outline"
                disabled={opening}
                data-im-connection-settings=""
                onClick={() => void openSettings(connection.botSlug)}
              >
                {t('team.imConnections.openSettings')}
              </Button>
            ) : undefined
          }
          data={{ 'data-im-connection-detail': connection.id }}
        >
          {openFailed ? <Note tone="danger">{t('team.imConnections.openFailed')}</Note> : null}
          <SettingsSection title={t('team.imConnections.details')}>
            <SettingsRow
              title={t('team.imConnections.bot')}
              control={<SettingsValue>{connection.botName}</SettingsValue>}
            />
            <SettingsRow
              title={t('team.imConnections.platform')}
              control={<SettingsValue>{platform(connection.platform)}</SettingsValue>}
            />
            <SettingsRow
              title={t('team.imConnections.accountState')}
              control={
                <Tag tone="neutral">
                  {t(
                    !connection.enabled
                      ? 'identity.state.paused'
                      : checks === 'pending'
                        ? 'im.checking'
                        : `identity.state.${connection.availability}`,
                  )}
                </Tag>
              }
            />
            <SettingsRow
              title={
                <ReceptionStatus
                  reception={connection.reception}
                  recovery={connection.recovery}
                  checking={checks === 'pending'}
                  t={t}
                />
              }
            />
          </SettingsSection>
          {connection.canOpenSettings ? null : (
            <Note>{t('team.imConnections.settingsUnavailable')}</Note>
          )}
        </DetailColumn>
      )}
      {dialog?.kind === 'pick' ? (
        <FormDialog
          title={t('team.imConnections.add')}
          description={t('team.imConnections.addHint')}
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          submitLabel={t('team.imConnections.next')}
          submitDisabled={!bots.some((bot) => bot.slug === dialog.botSlug)}
          onCancel={() => setDialog(undefined)}
          onSubmit={() => setDialog({ kind: 'bind', botSlug: dialog.botSlug })}
        >
          <Field label={t('team.imConnections.bot')} group>
            {() => (
              <Combobox
                label={t('team.imConnections.bot')}
                toggleLabel={t('team.imConnections.bot')}
                placeholder={t('team.imConnections.chooseBot')}
                searchable={false}
                value={dialog.botSlug}
                onSelect={(botSlug) => setDialog({ kind: 'pick', botSlug })}
                options={bots.map((bot) => ({ value: bot.slug, label: bot.displayName }))}
              />
            )}
          </Field>
        </FormDialog>
      ) : dialog?.kind === 'bind' ? (
        <BotBindingDialog
          key={dialog.botSlug}
          slug={dialog.botSlug}
          actions={actions}
          t={t}
          dismissLabel={t('common.close')}
          description={t('team.imConnections.bindHint', {
            bot: bots.find((bot) => bot.slug === dialog.botSlug)?.displayName ?? dialog.botSlug,
          })}
          onClose={() => {
            setDialog(undefined);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}
