import type { ModelBrand } from '@botharness/host-client/shared/model-brand';
import type { ColorValue } from 'react-native';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { ModelBrandIcon } from './model-brand-icon';

export function EngineBrandIcon({
  brand,
  color,
  label,
}: {
  brand: ModelBrand;
  color: ColorValue;
  label?: string;
}) {
  const theme = useDesignTheme();
  const size = theme.type.title.line;
  const badgeSize = Math.round(size * 0.55);
  return (
    <View style={{ position: 'relative', flexShrink: 0 }}>
      <ModelBrandIcon brand={brand} size={size} color={color} />
      <View
        testID="external-engine-badge"
        accessible={label !== undefined}
        accessibilityRole={label === undefined ? undefined : 'image'}
        accessibilityLabel={label}
        accessibilityElementsHidden={label === undefined}
        importantForAccessibility={label === undefined ? 'no-hide-descendants' : 'yes'}
        style={{
          position: 'absolute',
          end: -space.x2,
          bottom: -space.x1,
          padding: edge.hairline,
          borderRadius: radius.round,
          backgroundColor: theme.layer.raised.fill,
        }}
      >
        <Svg width={badgeSize} height={badgeSize} viewBox="0 0 24 24" fill="none">
          <Path
            d="M12 22v-5M15 8V2M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1zM9 8V2"
            stroke={theme.color.fg}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    </View>
  );
}
