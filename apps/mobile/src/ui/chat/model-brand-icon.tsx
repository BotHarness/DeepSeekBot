import { useId } from 'react';
import type { ColorValue } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { MODEL_BRAND_ICONS, type ModelBrand } from '@botharness/host-client/shared/model-brand';
import { RowIcon } from '../primitives/row-icon';

export function ModelBrandIcon({
  brand,
  size,
  color,
}: {
  brand: ModelBrand | undefined;
  size: number;
  color: ColorValue;
}) {
  const id = useId().replaceAll(':', '');
  if (brand === undefined) return <RowIcon name="model" size={size} color={color} />;
  const icon: { markup: string; evenodd?: boolean } = MODEL_BRAND_ICONS[brand];
  const xml = `<svg viewBox="0 0 24 24" fill="currentColor"${
    icon.evenodd === true ? ' fill-rule="evenodd"' : ''
  }>${icon.markup.replaceAll('{id}', `bh-model-${brand}-${id}`)}</svg>`;
  return (
    <SvgXml
      testID={`model-brand-${brand}`}
      xml={xml}
      width={size}
      height={size}
      color={color}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
