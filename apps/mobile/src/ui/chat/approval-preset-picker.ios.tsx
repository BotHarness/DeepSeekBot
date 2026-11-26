import {
  Button,
  Host,
  HStack,
  Image,
  Menu,
  Section,
  Spacer,
  Text,
  Toggle,
} from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  accessibilityLabel,
  buttonStyle,
  disabled as disabledModifier,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  tint,
  truncationMode,
} from '@expo/ui/swift-ui/modifiers';

import { useState } from 'react';
import { View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { Text as Measure } from '../primitives/text';
import { space } from '../design/tokens';
import { controlCase } from '../platform-copy';
import type { ApprovalPresetPickerProps } from './approval-preset-picker';

export function ApprovalPresetPicker({
  label,
  header,
  note,
  options,
  manageLabel,
  disabled,
  maxWidth,
  next,
  onSelect,
  onManage,
}: ApprovalPresetPickerProps) {
  const theme = useDesignTheme();
  const caption = [font({ textStyle: 'footnote' }), foregroundStyle(theme.color.muted)];
  const [tagWidth, setTagWidth] = useState(0);
  const [revision, setRevision] = useState(0);
  const reserve = Math.max(0, (maxWidth ?? 0) - (next === undefined ? 0 : tagWidth + space.x3));
  return (
    <View style={{ width: '100%' }}>
      {next === undefined ? null : (
        <Measure
          variant="meta"
          numberOfLines={1}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onLayout={(event) => setTagWidth(event.nativeEvent.layout.width)}
          style={{ position: 'absolute', opacity: 0 }}
        >
          {next}
        </Measure>
      )}
      <Host
        key={theme.scheme}
        colorScheme={theme.scheme}
        matchContents={{ vertical: true }}
        style={{ width: '100%', minHeight: theme.touch }}
      >
        <HStack
          spacing={space.x3}
          modifiers={[frame({ maxWidth: Infinity, minHeight: theme.touch, alignment: 'trailing' })]}
        >
          <Spacer minLength={reserve} />
          {next === undefined ? null : (
            <Text
              testID="approval-preset-next"
              modifiers={[...caption, fixedSize({ horizontal: true, vertical: true })]}
            >
              {next}
            </Text>
          )}
          <Menu
            modifiers={[
              buttonStyle('plain'),
              tint(theme.color.fg),
              accessibilityLabel(label),
              accessibilityIdentifier('approval-preset-trigger'),
              disabledModifier(disabled),
            ]}
            label={
              <HStack spacing={space.x1}>
                <Text modifiers={[...caption, lineLimit(1), truncationMode('tail')]}>{label}</Text>
                <Image systemName="chevron.down" modifiers={caption} />
              </HStack>
            }
          >
            <Section title={header}>
              {options.map((option) => (
                <Toggle
                  key={`${option.key}:${revision}`}
                  testID={`approval-preset-option-${option.key}`}
                  isOn={option.selected}
                  modifiers={[disabledModifier(option.disabled === true)]}
                  onIsOnChange={() => {
                    setRevision((value) => value + 1);
                    onSelect(option);
                  }}
                >
                  <Text>{option.title}</Text>
                  {option.detail === undefined ? null : <Text>{option.detail}</Text>}
                </Toggle>
              ))}
            </Section>
            {manageLabel === undefined || onManage === undefined ? null : (
              <Section>
                <Button
                  testID="approval-preset-manage"
                  label={controlCase(manageLabel)}
                  systemImage="slider.horizontal.3"
                  onPress={onManage}
                />
              </Section>
            )}
            <Section>
              <Text>{note}</Text>
            </Section>
          </Menu>
        </HStack>
      </Host>
    </View>
  );
}
