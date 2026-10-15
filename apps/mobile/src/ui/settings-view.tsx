import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import type { ConnectionState } from '../host/client';
import { useDesignTheme } from './design/theme';
import { space } from './design/tokens';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { Text } from './primitives/text';
import { errorText, Notice } from './request-parts';
import { t } from './strings';

export interface SettingsActions {
  onClose(): void;
  onOpenFullClient(): void;
  onComputers(): void;
  onHostLook(): void;
  onNotifications(): void;
  onUnpair(): Promise<void>;
}

const STATUS: Record<ConnectionState['status'], string> = {
  connected: t.connected,
  connecting: t.connecting,
  reconnecting: t.reconnecting,
  refused: t.refused,
  unreachable: t.unreachable,
  stopped: '',
};

export function SettingsView({
  hostName,
  connection,
  actions,
}: {
  hostName: string | undefined;
  connection: ConnectionState;
  actions: SettingsActions;
}) {
  const theme = useDesignTheme();
  const [unpairError, setUnpairError] = useState<string>();
  const status = [STATUS[connection.status], connection.route].filter((part) => part !== '');
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.base }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: space.x4,
          paddingLeft: space.x5,
          paddingRight: space.x2,
        }}
      >
        <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
          {t.settings}
        </Text>
        <Pressable
          onPress={actions.onClose}
          accessibilityRole="button"
          accessibilityLabel={t.done}
          style={({ pressed }) => ({
            minWidth: theme.touch,
            minHeight: theme.touch,
            paddingHorizontal: space.x3,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text tone="accent" strong>
            {t.done}
          </Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ gap: space.x6, padding: space.x5 }}>
        <SettingsSection title={t.connections}>
          <SettingsRow title={hostName ?? '—'} detail={status.join(' · ')} />
          <SettingsRow title={t.computers} detail={t.computersHint} onPress={actions.onComputers} />
          <SettingsRow title={t.notifications} onPress={actions.onNotifications} />
          <SettingsRow title={t.openFullClient} tone="accent" onPress={actions.onOpenFullClient} />
          <SettingsRow
            title={t.unpair}
            tone="danger"
            onPress={() => {
              setUnpairError(undefined);
              actions.onUnpair().catch((error: unknown) => setUnpairError(errorText(error)));
            }}
          />
        </SettingsSection>
        {unpairError === undefined ? null : (
          <Notice tone="danger">{`${t.unpairFailed} ${unpairError}`}</Notice>
        )}
        <SettingsSection title={t.interface}>
          <SettingsRow title={t.hostLook} detail={t.hostLookHint} onPress={actions.onHostLook} />
        </SettingsSection>
      </ScrollView>
    </View>
  );
}
