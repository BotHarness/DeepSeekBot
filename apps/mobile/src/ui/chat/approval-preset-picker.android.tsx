import {
  Box,
  Column,
  DropdownMenu,
  Host,
  Text as ComposeText,
  useMaterialColors,
} from '@expo/ui/jetpack-compose';
import {
  Shapes,
  background,
  clip,
  fillMaxSize,
  fillMaxWidth,
  padding,
  width,
} from '@expo/ui/jetpack-compose/modifiers';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useMaterialRoles } from '../design/material-tokens';
import { useDesignTheme } from '../design/theme';
import { materialMenu, presetChip, radius, space } from '../design/tokens';
import { MaterialMenuGroup } from '../primitives/material-menu.android';
import { SystemSymbol } from '../primitives/system-symbol';
import { Text } from '../primitives/text';
import { ChevronDownIcon } from '../shell/icons';
import type { ApprovalPresetPickerProps } from './approval-preset-picker';

export function ApprovalPresetPicker({
  label,
  value,
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
  const roles = useMaterialRoles();
  const colors = useMaterialColors();
  const [open, setOpen] = useState(false);
  const iconSize = theme.type.meta.size * theme.fontScale;
  const inset = space.x3;
  if (disabled && open) setOpen(false);
  const blank = <View style={{ width: materialMenu.iconSize, height: materialMenu.iconSize }} />;
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
                  fillMaxWidth(),
                  clip(Shapes.RoundedCorner(materialMenu.containerRadius)),
                  background(
                    theme.scheme === 'dark' ? colors.surfaceContainerHigh : colors.surfaceContainer,
                  ),
                  padding(
                    materialMenu.horizontalPadding,
                    materialMenu.verticalPadding,
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
        hitSlop={Math.max(0, (theme.touch - presetChip.height) / 2)}
        android_ripple={{ color: theme.layer.sheet.pressed, borderless: false }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-end',
          gap: space.x1,
          minHeight: presetChip.height,
          paddingLeft: inset,
          paddingRight: space.x2,
          borderRadius: radius.round,
          overflow: 'hidden',
          backgroundColor: roles.secondaryContainer,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <Text
          variant="meta"
          numberOfLines={1}
          style={{
            flexShrink: 1,
            color: roles.onSecondaryContainer,
            ...(maxWidth === undefined
              ? {}
              : { maxWidth: Math.max(0, maxWidth - iconSize - space.x1 - inset - space.x2) }),
          }}
        >
          {value}
        </Text>
        <ChevronDownIcon color={roles.onSecondaryContainer} size={iconSize} />
      </Pressable>
    </View>
  );
}
