import type { ReactNode } from 'react';

import { sameModel, type ModelRoute } from '@botharness/host-client/bot-settings';
import type { ModelSettingsState } from '@botharness/host-client/model-settings';
import { modelBrand } from '@botharness/host-client/shared/model-brand';
import { useDesignTheme } from '../design/theme';
import { modelEntryLabel } from './composer-labels';
import { ModelBrandIcon } from './model-brand-icon';
import { SettingsRow } from '../primitives/settings-row';
import { SHEET_GROUP } from './sheet';

export function RouteIcon({
  value,
  route,
}: {
  value: ModelSettingsState;
  route: ModelRoute | undefined;
}) {
  const theme = useDesignTheme();
  const entry =
    route === undefined ? undefined : value.models.find((item) => sameModel(item, route));
  const brand =
    entry !== undefined
      ? modelEntryLabel(entry).brand
      : route === undefined
        ? undefined
        : modelBrand({ provider: route.provider, model: route.model, name: route.model });
  return <ModelBrandIcon brand={brand} size={theme.type.title.line} color={theme.color.fg} />;
}

export function PickerLink({
  label,
  detail,
  leading,
  onPress,
}: {
  label: string;
  detail: string;
  leading?: ReactNode;
  onPress?: (() => void) | undefined;
}) {
  return (
    <SettingsRow
      on={SHEET_GROUP}
      title={label}
      detail={detail}
      leading={leading}
      disclosure
      onPress={onPress}
    />
  );
}
