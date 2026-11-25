import {
  BottomSheet,
  Button,
  Group,
  HStack,
  Host,
  Image,
  List,
  NavigationStack,
  ProgressView,
  RNHostView,
  Section,
  Spacer,
  Text,
  Toggle,
  Toolbar,
  ToolbarItem,
  VStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  accessibilityLabel,
  buttonStyle,
  disabled,
  font,
  foregroundStyle,
  frame,
  listStyle,
  navigationBarTitleDisplayMode,
  navigationTitle,
  presentationDetents,
  presentationDragIndicator,
  scrollContentBackground,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useRef, useState } from 'react';
import { Platform, PlatformColor, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import type { SystemListRow, SystemListSheetProps } from './system-list-sheet';

export function SystemListSheet({
  visible,
  title,
  closeLabel,
  sections,
  confirm,
  onClose,
  onDismissed,
}: SystemListSheetProps) {
  const theme = useDesignTheme();
  const [shown, setShown] = useState(visible);
  const [round, setRound] = useState(0);
  const open = useRef(visible);
  open.current = visible;
  if (visible && !shown) setShown(true);
  if (!shown) return null;
  const glass = Number(Platform.Version) >= 26;
  const row = (item: SystemListRow) => {
    if (item.kind === 'toggle')
      return (
        <Toggle
          key={item.key}
          label={item.label}
          isOn={item.value}
          onIsOnChange={item.onChange}
          modifiers={[tint(theme.color.accent)]}
        />
      );
    if (item.kind === 'action')
      return (
        <Button
          key={item.key}
          label={item.label}
          onPress={item.onPress}
          modifiers={[accessibilityLabel(item.label)]}
        />
      );
    if (item.kind === 'note')
      return (
        <Text
          key={item.key}
          modifiers={[
            font({ textStyle: item.tone === 'label' ? 'body' : 'subheadline' }),
            foregroundStyle(
              PlatformColor(
                item.tone === 'label'
                  ? 'label'
                  : item.tone === 'danger'
                    ? 'systemRed'
                    : item.tone === 'warning'
                      ? 'systemOrange'
                      : 'secondaryLabel',
              ),
            ),
          ]}
        >
          {item.text}
        </Text>
      );
    if (item.kind === 'progress')
      return (
        <HStack key={item.key} modifiers={[accessibilityLabel(item.label)]}>
          <Spacer />
          <ProgressView />
          <Spacer />
        </HStack>
      );
    const ink = PlatformColor(
      item.disabled === true || item.muted === true
        ? 'tertiaryLabel'
        : item.destructive === true
          ? 'systemRed'
          : 'label',
    );
    const secondary = PlatformColor('secondaryLabel');
    return (
      <Button
        key={item.key}
        {...(item.testID === undefined ? {} : { testID: item.testID })}
        onPress={item.onPress}
        modifiers={[
          accessibilityLabel(item.accessibilityLabel ?? item.label),
          accessibilityAddTraits(item.selected === true ? ['isSelected'] : []),
          disabled(item.disabled === true),
        ]}
      >
        <HStack spacing={12}>
          {item.leading === undefined ? null : (
            <RNHostView matchContents>
              <View style={{ width: item.leading.size, height: item.leading.size }}>
                {item.leading.node}
              </View>
            </RNHostView>
          )}
          {item.systemImage === undefined ? null : (
            <Image systemName={item.systemImage} modifiers={[foregroundStyle(ink)]} />
          )}
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[foregroundStyle(ink)]}>{item.label}</Text>
            {item.detail === undefined ? null : (
              <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(secondary)]}>
                {item.detail}
              </Text>
            )}
          </VStack>
          <Spacer />
          {item.value === undefined ? null : (
            <Text modifiers={[foregroundStyle(secondary)]}>{item.value}</Text>
          )}
          {item.busy === true ? (
            <ProgressView />
          ) : item.selected === true ? (
            <Image
              systemName="checkmark"
              modifiers={[font({ textStyle: 'body', weight: 'semibold' })]}
              color={theme.color.accent}
            />
          ) : item.accessory === 'add' ? (
            <Image systemName="plus" color={theme.color.accent} />
          ) : item.accessory === 'chevron' ? (
            <Image
              systemName="chevron.right"
              modifiers={[
                font({ textStyle: 'footnote', weight: 'semibold' }),
                foregroundStyle(PlatformColor('tertiaryLabel')),
              ]}
            />
          ) : (
            <Spacer modifiers={[frame({ width: 0 })]} />
          )}
        </HStack>
      </Button>
    );
  };
  return (
    <Host
      key={round}
      colorScheme={theme.scheme}
      pointerEvents="none"
      style={{ position: 'absolute' }}
    >
      <BottomSheet
        isPresented={visible}
        onIsPresentedChange={(presented) => {
          if (!presented) onClose();
        }}
        onDismiss={() => {
          if (open.current) {
            setRound((value) => value + 1);
            return;
          }
          setShown(false);
          onDismissed?.();
        }}
      >
        <Group
          modifiers={[
            presentationDetents(['medium', 'large']),
            presentationDragIndicator('visible'),
          ]}
        >
          <NavigationStack>
            <Toolbar>
              <List
                modifiers={[
                  listStyle('insetGrouped'),
                  scrollContentBackground('hidden'),
                  navigationTitle(title),
                  navigationBarTitleDisplayMode('inline'),
                ]}
              >
                {sections.map((section) => (
                  <Section
                    key={section.key}
                    {...(section.title === undefined ? {} : { title: section.title })}
                    {...(section.footer === undefined
                      ? {}
                      : { footer: <Text>{section.footer}</Text> })}
                  >
                    {section.rows.map(row)}
                  </Section>
                ))}
              </List>
              <Toolbar.Content>
                <ToolbarItem placement="cancellationAction">
                  <Button
                    role="close"
                    systemImage="xmark"
                    onPress={onClose}
                    modifiers={[accessibilityLabel(closeLabel)]}
                  />
                </ToolbarItem>
                {confirm === undefined ? null : (
                  <ToolbarItem placement="confirmationAction">
                    <Button
                      label={confirm.label}
                      {...(glass ? { systemImage: 'checkmark' as const } : {})}
                      onPress={confirm.onPress}
                      modifiers={[
                        accessibilityLabel(confirm.label),
                        disabled(confirm.disabled === true),
                        ...(glass
                          ? [buttonStyle('glassProminent')]
                          : [font({ textStyle: 'body', weight: 'semibold' })]),
                      ]}
                    />
                  </ToolbarItem>
                )}
              </Toolbar.Content>
            </Toolbar>
          </NavigationStack>
        </Group>
      </BottomSheet>
    </Host>
  );
}
