import { Button, Host, HStack, Image, Menu, Section, Text, Toggle } from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  accessibilityLabel,
  buttonStyle,
  disabled as disabledModifier,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  tint,
  truncationMode,
} from '@expo/ui/swift-ui/modifiers';

import { useDesignTheme } from '../design/theme';
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
  onSelect,
  onManage,
}: ApprovalPresetPickerProps) {
  const theme = useDesignTheme();
  const caption = [font({ textStyle: 'footnote' }), foregroundStyle(theme.color.muted)];
  return (
    <Host
      key={theme.scheme}
      colorScheme={theme.scheme}
      matchContents={{ vertical: true }}
      style={{ width: '100%', minHeight: theme.touch }}
    >
      <Menu
        modifiers={[
          buttonStyle('plain'),
          frame({ maxWidth: Infinity, minHeight: theme.touch, alignment: 'trailing' }),
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
              key={option.key}
              testID={`approval-preset-option-${option.key}`}
              isOn={option.selected}
              modifiers={[disabledModifier(option.disabled === true)]}
              onIsOnChange={() => {
                if (!option.selected) onSelect(option);
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
    </Host>
  );
}
