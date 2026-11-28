import { useState } from 'react';
import { View, type ViewInstance } from 'react-native';

import type { HostClient } from '@botharness/host-client/client';
import {
  loadBotConnectors,
  setBotConnector,
  type BotConnectorAccount,
} from '@botharness/host-client/connectors';
import type { LayerName } from '../design/layers';
import { useMounted } from '../mounted';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';

type Load =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; accounts: BotConnectorAccount[] };

export function BotConnectorSettings({
  client,
  botSlug,
  on,
}: {
  client: HostClient;
  botSlug: string;
  on: LayerName;
}) {
  const t = useStrings();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const mount = useMounted<ViewInstance>(() => {
    let live = true;
    loadBotConnectors(client, botSlug).then(
      (accounts) => {
        if (live) setLoad({ kind: 'ready', accounts });
      },
      () => {
        if (live) setLoad({ kind: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [client, botSlug]);
  const change = async (account: BotConnectorAccount, enabled: boolean) => {
    if (busy !== undefined) return;
    setBusy(account.accountId);
    setError(undefined);
    try {
      const accounts = await setBotConnector(
        client,
        botSlug,
        account.accountId,
        enabled ? 'read' : null,
      );
      setLoad({ kind: 'ready', accounts });
    } catch {
      setError(t.connector.saveFailed);
    } finally {
      setBusy(undefined);
    }
  };
  return (
    <View ref={mount} style={{ alignSelf: 'stretch' }}>
      <SettingsSection
        title={t.connector.section}
        {...(load.kind === 'ready' && load.accounts.length > 0
          ? { footer: t.connector.footer }
          : {})}
        on={on}
      >
        {load.kind === 'loading' ? (
          <SettingsRow on={on} title={t.connector.section} control={{ kind: 'busy' }} />
        ) : load.kind === 'failed' ? (
          <SettingsRow on={on} title={t.connector.loadFailed} tone="muted" />
        ) : load.accounts.length === 0 ? (
          <SettingsRow on={on} title={t.connector.empty} tone="muted" />
        ) : (
          load.accounts.map((account) => {
            const access = account.access ?? account.once;
            const accessLabel =
              access === undefined
                ? undefined
                : access === 'write'
                  ? t.connector.write
                  : t.connector.read;
            const detail = [
              account.label === account.name ? undefined : account.label,
              account.identity,
              account.own ? t.connector.botOwn : undefined,
              account.once !== undefined && accessLabel !== undefined
                ? t.connector.onceDetail(accessLabel)
                : accessLabel,
            ]
              .filter((part) => part !== undefined && part !== '')
              .join(' · ');
            return (
              <SettingsRow
                key={account.accountId}
                on={on}
                testID={`bot-connector-${account.accountId}`}
                title={account.name}
                {...(detail === '' ? {} : { detail })}
                accessibilityLabel={`${account.name} · ${detail}`}
                control={
                  busy === account.accountId
                    ? { kind: 'busy' }
                    : {
                        kind: 'switch',
                        value: access !== undefined,
                        disabled: busy !== undefined || (!account.active && access === undefined),
                        onChange: (value) => void change(account, value),
                      }
                }
              />
            );
          })
        )}
      </SettingsSection>
      {error === undefined ? null : (
        <Text accessibilityRole="alert" tone="danger">
          {error}
        </Text>
      )}
    </View>
  );
}
