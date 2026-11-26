import { View } from 'react-native';
import {
  HOST_COLOR_IDS,
  hostColorInk,
  hostTileFill,
  type HostColorId,
} from '@botharness/host-client/ui/design/host-look';
import { useDesignTheme } from '../../ui/design/theme';
import { cornerBadge } from '../../ui/design/tokens';
import { Text } from '../../ui/primitives/text';
import { folderColorIndex, folderMonogram } from './session-query-model';

export function SessionFolderAvatar({
  folderName,
  size,
  corner,
  colorId: hostColor,
  testID,
}: {
  folderName: string | undefined;
  size: number;
  corner: number;
  colorId?: HostColorId;
  testID?: string;
}) {
  const theme = useDesignTheme();
  const colorId = hostColor ?? HOST_COLOR_IDS[folderColorIndex(folderName, HOST_COLOR_IDS.length)];
  return (
    <View
      {...(testID === undefined ? {} : { testID })}
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: corner,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: hostTileFill(theme.scheme, theme.color, colorId, theme.color.base),
      }}
    >
      <Text
        strong
        variant="meta"
        numberOfLines={1}
        maxFontSizeMultiplier={Math.max(cornerBadge.maxTextScale, size / theme.touch)}
        style={{ color: hostColorInk(theme.scheme, theme.color, colorId) }}
      >
        {folderMonogram(folderName)}
      </Text>
    </View>
  );
}
