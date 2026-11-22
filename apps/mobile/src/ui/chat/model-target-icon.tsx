import type { ModelBrand } from '@botharness/host-client/shared/model-brand';
import type { ColorValue } from 'react-native';

import { EngineBrandIcon } from './engine-brand-icon';
import { ModelBrandIcon } from './model-brand-icon';

type TargetIcon =
  | { brand: ModelBrand; external: true }
  | { brand: ModelBrand | undefined; external?: false };

export function ModelTargetIcon({
  target,
  color,
  size,
}: {
  target: TargetIcon;
  color: ColorValue;
  size: number;
}) {
  return target.external ? (
    <EngineBrandIcon brand={target.brand} size={size} color={color} />
  ) : (
    <ModelBrandIcon brand={target.brand} size={size} color={color} />
  );
}
