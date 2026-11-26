import { HStack, Image, List, RNHostView, Section, Spacer, Text } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  accessibilityValue,
  environment,
  font,
  foregroundStyle,
  frame,
  listRowBackground,
} from '@expo/ui/swift-ui/modifiers';
import { useCallback } from 'react';
import { View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { SettingsFormContext } from './settings-form-context';
import type { TabOrderItem, TabOrderListProps } from './tab-order-list-model';

export type { TabOrderItem, TabOrderListProps } from './tab-order-list-model';

const PRIMARY = { type: 'hierarchical', style: 'primary' } as const;

export function TabOrderList({ title, footer, items, copy, onMove }: TabOrderListProps) {
  const theme = useDesignTheme();
  const row = useCallback(
    ({ item, index }: { item: TabOrderItem; index: number }) => (
      <HStack
        spacing={space.x4}
        modifiers={[
          accessibilityLabel(item.label),
          accessibilityValue(copy.position(index + 1, items.length)),
        ]}
      >
        {item.avatar === undefined ? (
          <Image
            systemName={item.symbol.ios}
            modifiers={[
              font({ textStyle: 'body' }),
              frame({ minWidth: theme.type.title.line }),
              foregroundStyle(PRIMARY),
            ]}
          />
        ) : (
          <RNHostView matchContents>
            <SettingsFormContext.Provider value={false}>
              <View>{item.avatar}</View>
            </SettingsFormContext.Provider>
          </RNHostView>
        )}
        <Text modifiers={[font({ textStyle: 'body' }), foregroundStyle(PRIMARY)]}>
          {item.label}
        </Text>
        <Spacer />
      </HStack>
    ),
    [copy, items.length, theme.type.title.line],
  );
  return (
    <Section
      title={title}
      {...(footer === undefined ? {} : { footer: <Text>{footer}</Text> })}
      modifiers={[environment('editMode', 'active'), listRowBackground(theme.layer.raised.fill)]}
    >
      <List.ForEach
        testID="tab-order-list"
        data={items}
        keyExtractor={(item) => item.key}
        recycling={false}
        onMove={(sources, destination) => {
          const from = sources[0];
          if (from !== undefined) onMove(from, destination);
        }}
      >
        {row}
      </List.ForEach>
    </Section>
  );
}
