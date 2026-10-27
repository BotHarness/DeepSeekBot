import { Host } from '@expo/ui/jetpack-compose';
import { requireNativeView } from 'expo';
import { View, type ViewInstance, type ViewProps } from 'react-native';
import type { Ref } from 'react';

import { useDesignTheme } from '../design/theme';

export type PrimaryTab<T extends string> = {
  value: T;
  label: string;
  dotColor?: string;
  accessibilityLabel?: string;
};

type NativePrimaryTabRowProps = ViewProps & {
  tabs: { value: string; label: string; dotColor?: string; accessibilityLabel?: string }[];
  selected: string;
  containerColor?: string;
  onTabSelect(event: { nativeEvent: { value: string } }): void;
};

const NativePrimaryTabRow = requireNativeView<NativePrimaryTabRowProps>(
  'MaterialTabRow',
  'PrimaryTabRowView',
);

export function PrimaryTabRow<T extends string>({
  tabs,
  value,
  onChange,
  containerColor,
  rowRef,
  testID,
}: {
  tabs: readonly PrimaryTab<T>[];
  value: string | undefined;
  onChange(value: T): void;
  containerColor?: string;
  rowRef?: Ref<ViewInstance> | undefined;
  testID?: string;
}) {
  const theme = useDesignTheme();
  return (
    <View ref={rowRef} testID={testID} style={{ minHeight: theme.touch }}>
      <Host
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        matchContents={{ vertical: true }}
        style={{ width: '100%' }}
      >
        <NativePrimaryTabRow
          tabs={tabs.map((tab) => ({
            value: tab.value,
            label: tab.label,
            ...(tab.dotColor === undefined ? {} : { dotColor: tab.dotColor }),
            ...(tab.accessibilityLabel === undefined
              ? {}
              : { accessibilityLabel: tab.accessibilityLabel }),
          }))}
          selected={value ?? ''}
          {...(containerColor === undefined ? {} : { containerColor })}
          onTabSelect={(event) => {
            const next = tabs.find((tab) => tab.value === event.nativeEvent.value);
            if (next !== undefined) onChange(next.value);
          }}
        />
      </Host>
    </View>
  );
}
