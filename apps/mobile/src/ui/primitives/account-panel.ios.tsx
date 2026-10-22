import { Host } from '@expo/ui';
import { Button, Form, HStack, Image, Section, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonStyle,
  disabled,
  font,
  foregroundStyle,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { t } from '../strings';
import type { AccountPanelProps } from './account-panel';

export function AccountPanel(props: AccountPanelProps) {
  const theme = useDesignTheme();
  const locked = props.loading || props.busy;
  return (
    <Host style={{ flex: 1 }} colorScheme={theme.scheme} seedColor={theme.color.accent}>
      <Form testID="account-hosts">
        <Section title={t.pairAccount.title}>
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
              <Button
                label={props.pendingDeletion ? t.pairAccount.cleanupConfirm : t.pairAccount.signOut}
                systemImage="rectangle.portrait.and.arrow.right"
                onPress={props.onSignOut}
                modifiers={[tint(theme.color.danger), disabled(locked)]}
              />
              <Button
                label={t.pairAccount.deleteAccount}
                systemImage="trash"
                role="destructive"
                onPress={props.onDelete}
                modifiers={[tint(theme.color.danger), disabled(locked)]}
              />
            </>
          ) : null}
        </Section>
        {props.email !== null && props.email !== false ? (
          <Section title={t.pairAccount.computers}>
            {props.rows?.map((row) => (
              <Button
                key={row.id}
                testID={`account-computer-${row.id}`}
                onPress={() => props.onToggle(row.id)}
                modifiers={[
                  buttonStyle('plain'),
                  disabled(row.disabled || locked),
                  accessibilityLabel(
                    `${row.name}, ${row.detail}${row.selected ? `, ${t.pairAccount.selected}` : ''}`,
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
                        foregroundStyle({ type: 'color', color: theme.color.muted }),
                      ]}
                    >
                      {row.detail}
                    </Text>
                  </VStack>
                  <Spacer />
                  <Image
                    systemName={
                      row.added
                        ? 'checkmark.circle.fill'
                        : row.selected
                          ? 'checkmark.circle'
                          : 'circle'
                    }
                    modifiers={[
                      foregroundStyle({
                        type: 'color',
                        color: row.selected ? theme.color.accent : theme.color.muted,
                      }),
                    ]}
                  />
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
          <Section>
            <Text modifiers={[foregroundStyle({ type: 'color', color: theme.color.danger })]}>
              {props.error}
            </Text>
          </Section>
        ) : null}
        {props.rows?.length ? (
          <Section>
            <Button
              testID="account-add-selected"
              label={
                props.selectedCount
                  ? t.pairAccount.addSelected(props.selectedCount)
                  : t.pairAccount.choose
              }
              onPress={props.onAdd}
              modifiers={[
                buttonStyle('borderedProminent'),
                disabled(locked || !props.selectedCount),
                frame({ maxWidth: Infinity, minHeight: theme.touch }),
              ]}
            />
          </Section>
        ) : null}
      </Form>
    </Host>
  );
}
