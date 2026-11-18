import { useId, type ReactElement } from 'react';

import { MODEL_BRAND_ICONS, type ModelBrand } from '@botharness/host-client/shared/model-brand';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';

export {
  modelBrand,
  modelShortName,
  type ModelBrand,
  type ModelIdentity,
} from '@botharness/host-client/shared/model-brand';

export function ModelBrandIcon({
  brand,
  size = 14,
}: {
  brand: ModelBrand | undefined;
  size?: number;
}): ReactElement {
  const id = useId().replaceAll(':', '');
  if (brand === undefined) return <ChannelSidebarIcon name="cpu" size={size} />;
  const icon: { title: string; markup: string; evenodd?: boolean } = MODEL_BRAND_ICONS[brand];
  return (
    <svg
      data-model-brand={brand}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule={icon.evenodd === true ? 'evenodd' : undefined}
      aria-hidden="true"
      dangerouslySetInnerHTML={{
        __html: icon.markup.replaceAll('{id}', `bh-model-${brand}-${id}`),
      }}
    />
  );
}
