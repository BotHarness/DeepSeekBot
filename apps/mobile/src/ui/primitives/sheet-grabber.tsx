import { View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius, sheetHandle } from '../design/tokens';

export function SheetGrabber() {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        width: sheetHandle.width,
        height: sheetHandle.height,
        borderRadius: radius.round,
        backgroundColor: theme.overlay.handle,
      }}
    />
  );
}
