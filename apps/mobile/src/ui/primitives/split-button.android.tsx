import { Host, type PrimitiveBaseProps } from '@expo/ui/jetpack-compose';
import { testID } from '@expo/ui/jetpack-compose/modifiers';
import { requireNativeView } from 'expo';
import { useState } from 'react';

import { useDesignTheme } from '../design/theme';
import { splitButton } from '../design/tokens';
import type { SplitButtonItem, SplitButtonProps } from './split-button';

type NativeSplitButtonProps = PrimitiveBaseProps & {
  label: string;
  path: string;
  menuLabel: string;
  items: SplitButtonItem[];
  available: boolean;
  testPrefix: string;
  onPress(): void;
  onPick(event: { nativeEvent: { key: string } }): void;
  onSize(event: { nativeEvent: { width: number; height: number } }): void;
};

const NativeSplitButton = requireNativeView<NativeSplitButtonProps>(
  'MaterialSplitButton',
  'MaterialSplitButtonView',
);

export function SplitButton(props: SplitButtonProps) {
  const theme = useDesignTheme();
  const [size, setSize] = useState<{ width: number; height: number }>(splitButton.initial);
  return (
    <Host colorScheme={theme.scheme} seedColor={theme.color.accent} style={size}>
      <NativeSplitButton
        modifiers={[testID(props.testID)]}
        label={props.label}
        path={props.path}
        menuLabel={props.menuLabel}
        items={props.items}
        available={!props.disabled}
        testPrefix={props.testID}
        onPress={props.onPress}
        onPick={(event) => props.onPick(event.nativeEvent.key)}
        onSize={(event) => {
          const { width, height } = event.nativeEvent;
          if (width > 0 && height > 0) setSize({ width, height });
        }}
      />
    </Host>
  );
}
