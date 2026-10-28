import { requireNativeView } from 'expo';
import { useMounted } from '../mounted';
import { View, processColor, useWindowDimensions, type ViewProps } from 'react-native';
import { holdBack } from '../shell/back-owner';

import { useDesignTheme } from '../design/theme';
import { materialDrawer } from '../design/tokens';
import type { EndSheetProps } from './end-sheet';

const NativeEndSheet = requireNativeView<
  ViewProps & {
    open: boolean;
    active: boolean;
    gesturesEnabled: boolean;
    fullWidth: boolean;
    panelWidth: number;
    sheetColor: number;
    scrimColor: number;
    onOpening(): void;
    onOpenChange(event: { nativeEvent: { open: boolean } }): void;
  }
>('EndSheet');

export function EndSheet({
  open,
  active,
  enabled,
  fullWidth = false,
  panel,
  children,
  onOpening,
  onOpenChange,
}: EndSheetProps) {
  const theme = useDesignTheme();
  const { width } = useWindowDimensions();
  const sheetColor = processColor(theme.overlay.fill);
  const scrimColor = processColor(theme.scrim);
  if (typeof sheetColor !== 'number' || typeof scrimColor !== 'number')
    throw new Error('EndSheet requires a resolved surface colour');
  const panelWidth = fullWidth
    ? width
    : Math.min(materialDrawer.width, width - materialDrawer.scrimGutter);
  const backRef = useMounted(() => {
    if (!active || !open) return;
    const subscription = holdBack(() => {
      onOpenChange(false);
      return true;
    });
    return () => subscription.remove();
  }, [active, open, onOpenChange]);
  return (
    <NativeEndSheet
      style={{ flex: 1 }}
      open={open}
      active={active}
      gesturesEnabled={enabled && active}
      fullWidth={fullWidth}
      panelWidth={panelWidth}
      sheetColor={sheetColor}
      scrimColor={scrimColor}
      onOpening={() => onOpening?.()}
      onOpenChange={({ nativeEvent }) => onOpenChange(nativeEvent.open)}
    >
      <View ref={backRef} collapsable={false} style={{ position: 'absolute', inset: 0 }}>
        {children}
      </View>
      <View
        collapsable={false}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: panelWidth,
          backgroundColor: theme.overlay.fill,
        }}
      >
        {panel}
      </View>
    </NativeEndSheet>
  );
}
