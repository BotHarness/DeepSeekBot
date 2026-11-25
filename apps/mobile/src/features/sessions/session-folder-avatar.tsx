import { View } from 'react-native';
import {
  HOST_COLOR_IDS,
  hostColorInk,
  hostTileFill,
} from '@botharness/host-client/ui/design/host-look';
import { useDesignTheme } from '../../ui/design/theme';
import { cornerBadge } from '../../ui/design/tokens';
import { Text } from '../../ui/primitives/text';
import { folderColorIndex, folderMonogram } from './session-query-model';

export function SessionFolderAvatar({
  folderName,
  size,
  corner,
  testID,
}: {
  folderName: string | undefined;
  size: number;
  corner: number;
  testID?: string;
}) {
  const theme = useDesignTheme();
  const colorId = HOST_COLOR_IDS[folderColorIndex(folderName, HOST_COLOR_IDS.length)];
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
        maxFontSizeMultiplier={cornerBadge.maxTextScale}
        style={{ color: hostColorInk(theme.scheme, theme.color, colorId) }}
      >
        {folderMonogram(folderName)}
      </Text>
    </View>
  );
}
