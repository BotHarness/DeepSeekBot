import { SvgXml } from 'react-native-svg';

import { imPlatformIcon } from '@botharness/host-client/shared/im-platform-icons';
import { useDesignTheme } from '../design/theme';
import { RowIcon } from '../primitives/row-icon';

export function ImPlatformIcon({ platform }: { platform: string | undefined }) {
  const theme = useDesignTheme();
  const size = theme.type.title.line * theme.fontScale;
  const icon = platform === undefined ? undefined : imPlatformIcon(platform);
  if (icon === undefined) return <RowIcon name="messageDisplay" size={size} />;
  return (
    <SvgXml
      testID={`im-platform-${platform}`}
      xml={`<svg viewBox="${icon.viewBox}">${icon.markup}</svg>`}
      width={size}
      height={size}
      color={'tint' in icon ? icon.tint : theme.color.fg}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
