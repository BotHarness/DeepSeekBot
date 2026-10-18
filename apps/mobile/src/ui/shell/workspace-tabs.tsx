import type { Ref } from 'react';
import { Platform, Pressable, View, type ViewInstance } from 'react-native';

import { edge, radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { DrawerMaterial } from '../primitives/drawer-material';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { CloudIcon, ComputerIcon } from './icons';

export type WorkspaceTab = 'computers' | 'cloud';

export function WorkspaceTabs({
  value,
  onChange,
  selectedRef,
}: {
  value: WorkspaceTab;
  selectedRef?: Ref<ViewInstance>;
  onChange(value: WorkspaceTab): void;
}) {
  const theme = useDesignTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space.x3 }}>
      {(['computers', 'cloud'] as const).map((tab) => {
        const selected = value === tab;
        const Icon = tab === 'computers' ? ComputerIcon : CloudIcon;
        const label = tab === 'computers' ? t.computers : t.workspaceAdd.cloudTab;
        return (
          <Pressable
            key={tab}
            ref={selected ? selectedRef : undefined}
            accessibilityRole={Platform.OS === 'ios' ? 'button' : 'tab'}
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => onChange(tab)}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              minHeight: theme.touch,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: theme.largeText ? 'column' : 'row',
              gap: space.x2,
              paddingHorizontal: space.x3,
              paddingVertical: space.x3,
              borderRadius: theme.largeText ? radius.lg : radius.round,
              borderWidth: edge.focus,
              borderColor: selected ? theme.color.fg : 'transparent',
              backgroundColor: pressed ? theme.layer.raised.pressed : 'transparent',
            })}
          >
            <DrawerMaterial rounded={theme.largeText} />
            <Icon
              color={selected ? theme.color.fg : theme.color.muted}
              size={theme.type.body.size}
            />
            <Text
              strong={selected}
              tone={selected ? 'fg' : 'muted'}
              style={{ flexShrink: 1, textAlign: 'center' }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
