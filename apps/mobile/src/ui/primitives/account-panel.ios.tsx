import { Host } from '@expo/ui';
import {
  Button,
  Form,
  HStack,
  Image,
  Label,
  ProgressView,
  Section,
  Spacer,
  Text,
  VStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityHidden,
  accessibilityLabel,
  buttonStyle,
  disabled,
  font,
  foregroundStyle,
  frame,
  labelStyle,
  listRowBackground,
  offset,
  scrollContentBackground,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { accountActionIcon, space } from '../design/tokens';
import { useStrings } from '../strings';
import type { AccountPanelProps } from './account-panel';
import { StepBar } from './step-bar';

export function AccountPanel(props: AccountPanelProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  const locked = props.loading || props.busy;
  const row = [listRowBackground(theme.layer.raised.fill)];
  return (
    <View style={{ flex: 1 }}>
      <Host style={{ flex: 1 }} colorScheme={theme.scheme} seedColor={theme.color.accent}>
        <Form testID="account-hosts" modifiers={[scrollContentBackground('hidden')]}>
          <Section title={t.pairAccount.title} modifiers={row}>
            <HStack spacing={space.x3}>
              <Image systemName="person.crop.circle" />
              <Text modifiers={[font({ textStyle: 'body' })]}>
                {props.email === false ? t.loading : (props.email ?? t.pairAccount.hint)}
              </Text>
            </HStack>
            {props.email === null ? (
              <Button
                label={t.pairAccount.signIn}
                systemImage="person.crop.circle.badge.checkmark"
                onPress={props.onSignIn}
                modifiers={[disabled(locked)]}
              />
            ) : props.email !== false ? (
              <>
                <AccountAction
                  testID="account-sign-out"
                  label={
                    props.pendingDeletion ? t.pairAccount.cleanupConfirm : t.pairAccount.signOut
                  }
                  systemImage="rectangle.portrait.and.arrow.right"
                  onPress={props.onSignOut}
                  locked={locked}
                />
                <AccountAction
                  testID="account-delete"
                  label={t.pairAccount.deleteAccount}
                  systemImage="trash"
                  role="destructive"
                  onPress={props.onDelete}
                  locked={locked}
                />
              </>
            ) : null}
          </Section>
          {props.email !== null && props.email !== false ? (
            <Section title={t.pairAccount.computers} modifiers={row}>
              {props.rows?.map((row) => (
                <Button
                  key={row.id}
                  testID={`account-computer-${row.id}`}
                  onPress={() => props.onToggle(row.id)}
                  modifiers={[
                    buttonStyle('plain'),
                    disabled(row.disabled || locked),
                    accessibilityLabel(
                      `${row.name}, ${row.pairing ? t.pairAccount.pairing : row.detail}${row.selected ? `, ${t.pairAccount.selected}` : ''}`,
                    ),
                  ]}
                >
                  <HStack spacing={space.x3} modifiers={[frame({ minHeight: theme.touch })]}>
                    <Image systemName="desktopcomputer" />
                    <VStack alignment="leading" spacing={space.x1}>
                      <Text modifiers={[font({ textStyle: 'body' })]}>{row.name}</Text>
                      <Text
                        modifiers={[
                          font({ textStyle: 'caption' }),
                          foregroundStyle({
                            type: 'color',
                            color: theme.color.muted,
                          }),
                        ]}
                      >
                        {row.pairing ? t.pairAccount.pairing : row.detail}
                      </Text>
                    </VStack>
                    <Spacer />
                    {row.pairing ? (
                      <ProgressView />
                    ) : row.selected ? (
                      <Image
                        systemName="checkmark"
                        modifiers={[
                          font({ textStyle: 'body', weight: 'semibold' }),
                          foregroundStyle({
                            type: 'color',
                            color: theme.color.accent,
                          }),
                        ]}
                      />
                    ) : null}
                  </HStack>
                </Button>
              ))}
              {props.rows === undefined ? (
                <Text>{props.loading ? t.loading : t.pairAccount.choose}</Text>
              ) : props.rows.length === 0 ? (
                <Text>{t.pairAccount.empty}</Text>
              ) : null}
              <Button
                label={t.pairAccount.refresh}
                systemImage="arrow.clockwise"
                onPress={props.onRefresh}
                modifiers={[disabled(locked)]}
              />
            </Section>
          ) : null}
          {props.error ? (
            <Section modifiers={row}>
              <Text modifiers={[foregroundStyle({ type: 'color', color: theme.color.danger })]}>
                {props.error}
              </Text>
            </Section>
          ) : null}
        </Form>
      </Host>
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

function AccountAction(props: {
  testID: string;
  label: string;
  systemImage: 'rectangle.portrait.and.arrow.right' | 'trash';
  role?: 'destructive';
  onPress: () => void;
  locked: boolean;
}) {
  const theme = useDesignTheme();
  return (
    <Button
      testID={props.testID}
      role={props.role ?? 'default'}
      onPress={props.onPress}
      modifiers={[
        tint(theme.color.danger),
        disabled(props.locked),
        accessibilityLabel(props.label),
      ]}
    >
      <Label
        modifiers={[labelStyle('titleAndIcon')]}
        icon={
          <Image
            systemName={props.systemImage}
            modifiers={[
              font({ textStyle: 'body' }),
              foregroundStyle(theme.color.danger),
              ...(props.systemImage === 'rectangle.portrait.and.arrow.right'
                ? [
                    offset({
                      x: accountActionIcon.signOutOpticalOffset * theme.fontScale,
                    }),
                  ]
                : []),
              frame({
                width: accountActionIcon.slot * theme.fontScale,
                alignment: 'center',
              }),
              accessibilityHidden(),
            ]}
          />
        }
      >
        <Text modifiers={[font({ textStyle: 'body' }), foregroundStyle(theme.color.danger)]}>
          {props.label}
        </Text>
      </Label>
    </Button>
  );
}
