import { View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { clampScaledIconSize } from '../design/scaled-icon-size';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { FolderIcon } from '../shell/icons';
import { HostGlyph } from '../shell/host-tile';
import { barLabelProps, headerLabelScaleCeiling } from './native-header';
import type { SessionPlace } from './session-place';

export function SessionPlaceLine({ place }: { place: SessionPlace }) {
  const theme = useDesignTheme();
  const meta = theme.type.meta.size;
  const glyph = clampScaledIconSize(meta, theme.fontScale, meta * headerLabelScaleCeiling);
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      testID="session-header-place"
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3, minWidth: 0 }}
    >
      <HostGlyph icon={place.hostIcon} size={glyph} color={theme.color.muted} />
      {place.folder === undefined ? null : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2, flexShrink: 1 }}>
          <FolderIcon
            color={theme.color.muted}
            size={clampScaledIconSize(meta, theme.fontScale, meta * headerLabelScaleCeiling)}
          />
          <Text
            {...barLabelProps}
            variant="meta"
            tone="muted"
            numberOfLines={1}
            ellipsizeMode="middle"
            style={{ flexShrink: 1 }}
          >
            {place.folder}
          </Text>
        </View>
      )}
    </View>
  );
}
