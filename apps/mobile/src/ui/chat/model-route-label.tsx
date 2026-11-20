import type { ReactNode } from 'react';

import { sameModel, type ModelRoute } from '@botharness/host-client/bot-settings';
import type { ModelSettingsState } from '@botharness/host-client/model-settings';
import { turnTargetLabel } from '@botharness/host-client/turn-target';
import { modelBrand } from '@botharness/host-client/shared/model-brand';
import { useDesignTheme } from '../design/theme';
import { modelEntryLabel } from './composer-labels';
import { ModelBrandIcon } from './model-brand-icon';
import { ModelTargetIcon } from './model-target-icon';
import { SettingsRow } from '../primitives/settings-row';
import { useStrings } from '../strings';
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

export function CurrentEngineModel({
  value,
  heading,
  onPress,
}: {
  value: ModelSettingsState;
  heading?: string;
  onPress?: (() => void) | undefined;
}) {
  const theme = useDesignTheme();
  const t = useStrings();
  const target = value.currentTarget;
  if (target?.kind !== 'engine') return null;
  const label = turnTargetLabel(target, value, t.routingGroup.engineRow);
  return (
    <SettingsRow
      on={SHEET_GROUP}
      testID="current-engine-model"
      title={heading ?? t.modelSettings.groupCurrent(label.short)}
      detail={
        [heading === undefined ? undefined : label.short, label.effort, target.account]
          .filter(Boolean)
          .join(' · ') || undefined
      }
      leading={
        <ModelTargetIcon target={label} size={theme.type.title.line} color={theme.color.fg} />
      }
      accessibilityLabel={[
        heading,
        t.modelSettings.groupCurrent(label.name),
        t.routingGroup.externalEngine,
      ]
        .filter(Boolean)
        .join(', ')}
      disclosure={onPress !== undefined}
      onPress={onPress}
    />
  );
}
