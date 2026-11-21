import * as stylex from '@stylexjs/stylex';
import { useId, type ReactElement } from 'react';

import { MODEL_BRAND_ICONS, type ModelBrand } from '@botharness/host-client/shared/model-brand';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { border, color, radius } from './ds/tokens.stylex.js';

export {
  modelBrand,
  modelShortName,
  providerBrand,
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

const engineStyles = stylex.create({
  wrap: { position: 'relative', display: 'inline-flex', flexShrink: 0 },
  badge: {
    position: 'absolute',
    insetInlineEnd: '-4px',
    bottom: '-3px',
    display: 'inline-flex',
    padding: border.hairline,
    borderRadius: radius.round,
    backgroundColor: color.elevated,
    color: color.fg,
  },
});

export function EngineBrandIcon({
  brand,
  size = 14,
  label,
}: {
  brand: ModelBrand | undefined;
  size?: number;
  label?: string;
}): ReactElement {
  return (
    <span data-engine-brand={brand ?? ''} {...stylex.props(engineStyles.wrap)}>
      <ModelBrandIcon brand={brand} size={size} />
      <span
        data-external-engine-badge=""
        role={label === undefined ? undefined : 'img'}
        aria-label={label}
        aria-hidden={label === undefined ? true : undefined}
        {...stylex.props(engineStyles.badge)}
      >
        <ChannelSidebarIcon name="plug" size={Math.round(size * 0.55)} strokeWidth={2.5} />
      </span>
    </span>
  );
}
