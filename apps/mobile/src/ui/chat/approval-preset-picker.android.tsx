import { Box, Column, DropdownMenu, Host, Text as ComposeText } from '@expo/ui/jetpack-compose';
import { fillMaxSize, padding, width } from '@expo/ui/jetpack-compose/modifiers';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { materialMenu, space } from '../design/tokens';
import { MaterialMenuGroup } from '../primitives/material-menu.android';
import { SystemSymbol } from '../primitives/system-symbol';
import { Text } from '../primitives/text';
import { ChevronDownIcon } from '../shell/icons';
import type { ApprovalPresetPickerProps } from './approval-preset-picker';

export function ApprovalPresetPicker({
  label,
  header,
  note,
  options,
  manageLabel,
  disabled,
  maxWidth,
  onSelect,
  onManage,
}: ApprovalPresetPickerProps) {
  const theme = useDesignTheme();
  const [open, setOpen] = useState(false);
  if (disabled && open) setOpen(false);
  const blank = <View />;
  return (
    <View style={{ maxWidth: '100%' }}>
      <Host
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        ignoreSafeAreaKeyboardInsets
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      >
        <DropdownMenu
          expanded={open && !disabled}
          onDismissRequest={() => setOpen(false)}
          color="transparent"
          shadowElevation={0}
        >
          <DropdownMenu.Trigger>
            <Box modifiers={[fillMaxSize()]} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Items>
            <Column
              modifiers={[width(materialMenu.width)]}
              verticalArrangement={{ spacedBy: materialMenu.groupGap }}
            >
              <MaterialMenuGroup
                header={header}
                items={options.map((option) => ({
                  key: option.key,
                  label:
                    option.detail === undefined
                      ? option.title
                      : `${option.title} · ${option.detail}`,
                  selected: option.selected,
                  ...(option.disabled === true ? { disabled: true } : {}),
                  testID: `approval-preset-option-${option.key}`,
                  icon: blank,
                  onPress: () => {
                    setOpen(false);
                    onSelect(option);
                  },
                }))}
              />
              {manageLabel === undefined || onManage === undefined ? null : (
                <MaterialMenuGroup
                  items={[
                    {
                      key: 'manage',
                      label: manageLabel,
                      testID: 'approval-preset-manage',
                      icon: (
                        <SystemSymbol
                          name={{ ios: 'slider.horizontal.3', android: 'tune' }}
                          color={theme.color.fg}
                          size={materialMenu.iconSize}
                        />
                      ),
                      onPress: () => {
                        setOpen(false);
                        onManage();
                      },
                    },
                  ]}
                />
              )}
              <ComposeText
                color={theme.color.muted}
                style={{ typography: 'bodySmall' }}
                modifiers={[
                  padding(
                    materialMenu.horizontalPadding,
                    0,
                    materialMenu.horizontalPadding,
                    materialMenu.verticalPadding,
                  ),
                ]}
              >
                {note}
              </ComposeText>
            </Column>
          </DropdownMenu.Items>
        </DropdownMenu>
      </Host>
      <Pressable
        testID="approval-preset-trigger"
        disabled={disabled}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open && !disabled, disabled }}
        hitSlop={space.x3}
        android_ripple={{ color: theme.layer.sheet.pressed, borderless: false }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x1,
          minHeight: theme.touch,
        }}
      >
        <Text
          variant="meta"
          tone="muted"
          numberOfLines={1}
          style={{
            flexShrink: 1,
            ...(maxWidth === undefined
              ? {}
              : {
                  maxWidth: Math.max(
                    0,
                    maxWidth - theme.type.meta.size * theme.fontScale - space.x1,
                  ),
                }),
          }}
        >
          {label}
        </Text>
        <ChevronDownIcon color={theme.color.muted} size={theme.type.meta.size * theme.fontScale} />
      </Pressable>
    </View>
  );
}
