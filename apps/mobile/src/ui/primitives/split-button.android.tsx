import { requireNativeView } from 'expo';
import { useState } from 'react';
import type { ViewProps } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { splitButton } from '../design/tokens';
import type { SplitButtonItem, SplitButtonProps } from './split-button';

type NativeSplitButtonProps = ViewProps & {
  label: string;
  path: string;
  menuLabel: string;
  items: SplitButtonItem[];
  enabled: boolean;
  dark: boolean;
  container: string;
  content: string;
  testPrefix: string;
  onPress(): void;
  onPick(event: { nativeEvent: { key: string } }): void;
  onSize(event: { nativeEvent: { width: number; height: number } }): void;
};

const NativeSplitButton = requireNativeView<NativeSplitButtonProps>('MaterialSplitButton');

export function SplitButton(props: SplitButtonProps) {
  const theme = useDesignTheme();
  const [size, setSize] = useState<{ width: number; height: number }>(splitButton.initial);
  return (
    <NativeSplitButton
      testID={props.testID}
      style={size}
      label={props.label}
      path={props.path}
      menuLabel={props.menuLabel}
      items={props.items}
      enabled={!props.disabled}
      dark={theme.scheme === 'dark'}
      container={theme.layer.canvas.chosen}
      content={theme.color.fg}
      testPrefix={props.testID}
      onPress={props.onPress}
      onPick={(event) => props.onPick(event.nativeEvent.key)}
      onSize={(event) => {
        const { width, height } = event.nativeEvent;
        if (width > 0 && height > 0) setSize({ width, height });
      }}
    />
  );
}
