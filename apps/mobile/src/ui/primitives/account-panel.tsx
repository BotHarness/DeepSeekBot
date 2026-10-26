import { ScrollView, View } from 'react-native';
import type { PairingFailure } from '../../host/pairing';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { useStrings } from '../strings';
import { LoadingIndicator } from './loading-indicator';
import { SettingsRow, SettingsSection } from './settings-row';
import { StepBar } from './step-bar';
import { SystemSymbol } from './system-symbol';
import { Text } from './text';

export interface AccountComputerRow {
  id: string;
  name: string;
  detail: string;
  added: boolean;
  selected: boolean;
  pairing: boolean;
  disabled: boolean;
}
export interface AccountPanelProps {
  email: string | undefined | null | false;
  pendingDeletion?: boolean;
  loading: boolean;
  busy: boolean;
  rows: AccountComputerRow[] | undefined;
  error?: string | undefined;
  selectedCount: number;
  onToggle(id: string): void;
  onAdd(): void;
  onRefresh(): void;
  onSignIn(): void;
  onSignOut(): void;
  onDelete(): void;
}
export type AccountPairResult = PairingFailure | 'added';

export function AccountPanel(props: AccountPanelProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  const locked = props.loading || props.busy;
  const signedIn = props.email !== null && props.email !== false;
  const act = (action: () => void) => (locked ? undefined : action);
  const status = (row: AccountComputerRow) => (row.pairing ? t.pairAccount.pairing : row.detail);
  return (
    <View style={{ flex: 1, backgroundColor: theme.layer.canvas.fill }}>
      <ScrollView
        testID="account-hosts"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.x5, gap: space.x6 }}
      >
        <SettingsSection title={t.pairAccount.title} on="raised">
          <SettingsRow
            on="raised"
            title={props.email === false ? t.loading : (props.email ?? t.pairAccount.hint)}
          />
          {props.email === null ? (
            <SettingsRow
              on="raised"
              testID="account-sign-in"
              title={t.pairAccount.signIn}
              tone="accent"
              onPress={act(props.onSignIn)}
            />
          ) : null}
          {signedIn ? (
            <SettingsRow
              on="raised"
              testID="account-sign-out"
              title={props.pendingDeletion ? t.pairAccount.cleanupConfirm : t.pairAccount.signOut}
              tone="danger"
              onPress={act(props.onSignOut)}
            />
          ) : null}
          {signedIn ? (
            <SettingsRow
              on="raised"
              testID="account-delete"
              title={t.pairAccount.deleteAccount}
              tone="danger"
              onPress={act(props.onDelete)}
            />
          ) : null}
        </SettingsSection>
        {signedIn ? (
          <SettingsSection title={t.pairAccount.computers} on="raised">
            {props.rows?.map((row) => (
              <SettingsRow
                key={row.id}
                on="raised"
                testID={`account-computer-${row.id}`}
                title={row.name}
                detail={status(row)}
                tone={row.disabled ? 'muted' : 'fg'}
                selected={row.selected}
                accessibilityLabel={`${row.name}, ${status(row)}${row.selected ? `, ${t.pairAccount.selected}` : ''}`}
                trailing={
                  row.pairing ? (
                    <LoadingIndicator size="control" accessibilityLabel={t.pairAccount.pairing} />
                  ) : row.selected ? (
                    <SystemSymbol
                      name={{ ios: 'checkmark', android: 'check' }}
                      size={space.x6}
                      color={theme.color.accent}
                    />
                  ) : undefined
                }
                onPress={row.disabled || locked ? undefined : () => props.onToggle(row.id)}
              />
            ))}
            {props.rows?.length ? null : (
              <SettingsRow
                on="raised"
                title={
                  props.rows
                    ? t.pairAccount.empty
                    : props.loading
                      ? t.loading
                      : t.pairAccount.choose
                }
              />
            )}
            <SettingsRow
              on="raised"
              testID="account-refresh"
              title={t.pairAccount.refresh}
              tone="accent"
              onPress={act(props.onRefresh)}
            />
          </SettingsSection>
        ) : null}
        {props.error ? (
          <Text accessibilityRole="alert" tone="danger" style={{ paddingHorizontal: space.x5 }}>
            {props.error}
          </Text>
        ) : null}
      </ScrollView>
      {props.rows?.length ? (
        <StepBar
          primary={{
            testID: 'account-add-selected',
            label: props.selectedCount
              ? t.pairAccount.addSelected(props.selectedCount)
              : t.pairAccount.choose,
            disabled: props.loading || !props.selectedCount,
            busy: props.busy,
            onPress: props.onAdd,
          }}
        />
      ) : null}
    </View>
  );
}
