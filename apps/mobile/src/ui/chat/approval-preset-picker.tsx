import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { ChevronDownIcon } from '../shell/icons';
import type { PresetOption } from './approval-preset';

export interface ApprovalPresetPickerProps {
  label: string;
  header: string;
  note: string;
  options: PresetOption[];
  manageLabel?: string;
  disabled: boolean;
  onSelect(option: PresetOption): void;
  onManage?(): void;
}

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
  const [open, setOpen] = useState(false);
  return (
    <View style={{ alignItems: 'flex-end', gap: space.x2 }}>
      <Pressable
        testID="approval-preset-trigger"
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => setOpen(!open)}
        hitSlop={space.x3}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x1,
          maxWidth: '100%',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
        </Text>
        <ChevronDownIcon color={theme.color.muted} size={theme.type.meta.size * theme.fontScale} />
      </Pressable>
      {open ? (
        <View testID="approval-preset-menu" style={{ gap: space.x2, alignItems: 'flex-end' }}>
          <Text variant="meta" tone="muted">
            {header}
          </Text>
          {options.map((option) => (
            <Pressable
              key={option.key}
              testID={`approval-preset-option-${option.key}`}
              accessibilityRole="menuitem"
              accessibilityLabel={
                option.detail === undefined ? option.title : `${option.title}, ${option.detail}`
              }
              accessibilityState={{ selected: option.selected, disabled: option.disabled === true }}
              disabled={option.disabled === true}
              style={{ minHeight: theme.touch, justifyContent: 'center' }}
              onPress={() => {
                setOpen(false);
                onSelect(option);
              }}
            >
              <Text variant="meta" tone={option.selected ? 'fg' : 'muted'}>
                {option.detail === undefined ? option.title : `${option.title} · ${option.detail}`}
              </Text>
            </Pressable>
          ))}
          {manageLabel === undefined || onManage === undefined ? null : (
            <Pressable
              testID="approval-preset-manage"
              accessibilityRole="menuitem"
              accessibilityLabel={manageLabel}
              style={{ minHeight: theme.touch, justifyContent: 'center' }}
              onPress={() => {
                setOpen(false);
                onManage();
              }}
            >
              <Text variant="meta" tone="muted">
                {manageLabel}
              </Text>
            </Pressable>
          )}
          <Text variant="meta" tone="muted">
            {note}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
