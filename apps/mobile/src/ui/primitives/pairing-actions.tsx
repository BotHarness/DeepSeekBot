import { Button as NativeButton, Column, Host } from '@expo/ui';
import { useState } from 'react';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';

export type PairingAction = { label: string; testID: string; onPress(): void };
export type PairingActionsProps = {
  primary?: PairingAction | undefined;
  secondary: PairingAction;
  details?: PairingAction | undefined;
};

export function PairingActions({ primary, secondary, details }: PairingActionsProps) {
  const theme = useDesignTheme();
  const [width, setWidth] = useState<number>();
  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <Column spacing={space.x3} alignment="center" style={width === undefined ? {} : { width }}>
        {primary ? <NativeButton {...primary} style={{ paddingVertical: space.x3 }} /> : null}
        <NativeButton {...secondary} variant="outlined" style={{ paddingVertical: space.x3 }} />
        {details ? (
          <NativeButton {...details} variant="text" style={{ paddingVertical: space.x3 }} />
        ) : null}
      </Column>
    </Host>
  );
}
