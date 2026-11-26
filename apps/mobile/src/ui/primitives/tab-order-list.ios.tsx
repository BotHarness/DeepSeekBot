import { Label, List, RNHostView, Section, Text } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  accessibilityValue,
  font,
  foregroundStyle,
  lineLimit,
  listRowBackground,
  truncationMode,
} from '@expo/ui/swift-ui/modifiers';
import { useCallback } from 'react';
import { View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { SettingsFormContext } from './settings-form-context';
import type { TabOrderItem, TabOrderListProps } from './tab-order-list-model';

export type { TabOrderItem, TabOrderListProps } from './tab-order-list-model';

const PRIMARY = { type: 'hierarchical', style: 'primary' } as const;

export function TabOrderList({ title, footer, items, copy, onMove }: TabOrderListProps) {
  const theme = useDesignTheme();
  const row = useCallback(
    ({ item, index }: { item: TabOrderItem; index: number }) => (
      <Label
        modifiers={[
          foregroundStyle(PRIMARY),
          accessibilityLabel(item.label),
          accessibilityValue(copy.position(index + 1, items.length)),
        ]}
        {...(item.avatar === undefined
          ? { systemImage: item.symbol.ios }
          : {
              icon: (
                <RNHostView matchContents>
                  <SettingsFormContext.Provider value={false}>
                    <View>{item.avatar}</View>
                  </SettingsFormContext.Provider>
                </RNHostView>
              ),
            })}
      >
        <Text
          modifiers={[
            font({ textStyle: 'body' }),
            ...(theme.largeText ? [] : [lineLimit(1), truncationMode('tail')]),
          ]}
        >
          {item.label}
        </Text>
      </Label>
    ),
    [copy, items.length, theme.largeText],
  );
  return (
    <Section
      title={title}
      {...(footer === undefined ? {} : { footer: <Text>{footer}</Text> })}
      modifiers={[listRowBackground(theme.layer.raised.fill)]}
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
