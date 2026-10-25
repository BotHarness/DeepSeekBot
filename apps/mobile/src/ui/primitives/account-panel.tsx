import { Button, Checkbox, FieldGroup, Host, ListItem, Text as NativeText } from '@expo/ui';
import type { PairingFailure } from '../../host/pairing';
import { useDesignTheme } from '../design/theme';
import { useStrings } from '../strings';

export interface AccountComputerRow {
  id: string;
  name: string;
  detail: string;
  added: boolean;
  selected: boolean;
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
  return (
    <Host style={{ flex: 1 }} colorScheme={theme.scheme} seedColor={theme.color.accent}>
      <FieldGroup testID="account-hosts">
        <FieldGroup.Section title={t.pairAccount.title}>
          <NativeText>
            {props.email === false ? t.loading : (props.email ?? t.pairAccount.hint)}
          </NativeText>
          {props.email === null ? (
            <Button label={t.pairAccount.signIn} disabled={locked} onPress={props.onSignIn} />
          ) : props.email !== false ? (
            <>
              <Button
                label={props.pendingDeletion ? t.pairAccount.cleanupConfirm : t.pairAccount.signOut}
                variant="text"
                disabled={locked}
                onPress={props.onSignOut}
              />
              <Button
                label={t.pairAccount.deleteAccount}
                variant="text"
                disabled={locked}
                onPress={props.onDelete}
              >
                <NativeText textStyle={{ color: theme.color.danger }}>
                  {t.pairAccount.deleteAccount}
                </NativeText>
              </Button>
            </>
          ) : null}
        </FieldGroup.Section>
        {props.email !== null && props.email !== false ? (
          <FieldGroup.Section title={t.pairAccount.computers}>
            {props.rows?.map((row) => (
              <ListItem
                key={row.id}
                testID={`account-computer-${row.id}`}
                supportingText={row.detail}
              >
                <Checkbox
                  label={row.name}
                  testID={`account-select-${row.id}`}
                  value={row.selected || row.added}
                  disabled={row.disabled || locked}
                  onValueChange={() => props.onToggle(row.id)}
                />
              </ListItem>
            ))}
            {props.rows === undefined ? (
              <NativeText>{props.loading ? t.loading : t.pairAccount.choose}</NativeText>
            ) : props.rows.length === 0 ? (
              <NativeText>{t.pairAccount.empty}</NativeText>
            ) : null}
            <Button
              label={t.pairAccount.refresh}
              variant="text"
              disabled={locked}
              onPress={props.onRefresh}
            />
          </FieldGroup.Section>
        ) : null}
        {props.error ? (
          <FieldGroup.Section>
            <NativeText textStyle={{ color: theme.color.danger }}>{props.error}</NativeText>
          </FieldGroup.Section>
        ) : null}
        {props.rows?.length ? (
          <FieldGroup.Section>
            <Button
              testID="account-add-selected"
              label={
                props.selectedCount
                  ? t.pairAccount.addSelected(props.selectedCount)
                  : t.pairAccount.choose
              }
              disabled={locked || !props.selectedCount}
              onPress={props.onAdd}
            />
          </FieldGroup.Section>
        ) : null}
      </FieldGroup>
    </Host>
  );
}
