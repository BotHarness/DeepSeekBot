import { turnTargetLabel, type TurnTargetCatalog } from '@botharness/host-client/turn-target';
import type { TurnTarget } from '@botharness/host-protocol/turn-target';
import {
  modelCatalogGroupMemberLabels,
  type routingGroupEnginePresentation,
  type ModelCatalogEntry,
  type ModelCatalogGroup,
} from '@botharness/host-client/model-catalog';

import { View } from 'react-native';

import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { RowIcon } from '../primitives/row-icon';
import { SettingsRow, type SettingsRowProps } from '../primitives/settings-row';
import { SystemSymbol } from '../primitives/system-symbol';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { modelEntryLabel, restingLabel } from './composer-labels';
import { ModelTargetIcon } from './model-target-icon';
import { ModelBrandIcon } from './model-brand-icon';
import { shortModelName } from './model-route-text';
import { SHEET_GROUP } from './sheet';

type RowActions = Pick<
  SettingsRowProps,
  'onPress' | 'selected' | 'control' | 'accessory' | 'testID' | 'disclosure'
>;

export function modelPickerAvailability(
  entry: ModelCatalogEntry,
  t: ReturnType<typeof useStrings>,
) {
  return {
    usable: entry.credential === undefined && entry.restingUntil === undefined,
    detail:
      entry.credential === 'missing'
        ? t.modelNeedsKey(entry.providerName)
        : entry.credential === 'invalid'
          ? t.modelKeyInvalid(entry.providerName)
          : entry.restingUntil !== undefined
            ? `${entry.providerName} · ${restingLabel(entry.restingUntil)}`
            : entry.providerName,
  };
}

export function ModelPickerRow({
  entry,
  shortTitle = false,
  ...actions
}: RowActions & { entry: ModelCatalogEntry; shortTitle?: boolean }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const label = modelEntryLabel(entry);
  const { usable, detail } = modelPickerAvailability(entry, t);
  return (
    <SettingsRow
      {...actions}
      on={SHEET_GROUP}
      leading={
        <ModelBrandIcon
          brand={label.brand}
          size={theme.type.title.line}
          color={usable ? theme.color.fg : theme.color.muted}
        />
      }
      title={shortTitle ? label.short : label.name}
      accessibilityLabel={`${entry.modelName}, ${entry.providerName}`}
      detail={detail}
      tone={usable ? 'fg' : 'muted'}
    />
  );
}

export function ModelEnginePickerRow({
  row,
  isDefault = false,
  selected,
  ...actions
}: RowActions & {
  row: ReturnType<typeof routingGroupEnginePresentation>;
  isDefault?: boolean;
}) {
  const theme = useDesignTheme();
  const t = useStrings();
  return (
    <SettingsRow
      {...actions}
      selected={selected}
      on={SHEET_GROUP}
      leading={
        <ModelTargetIcon
          target={{ brand: row.brand, external: true }}
          size={theme.type.title.line}
          color={theme.color.fg}
        />
      }
      trailing={
        isDefault || selected ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.x2,
            }}
          >
            {isDefault ? (
              <View
                style={{
                  backgroundColor: theme.layer[SHEET_GROUP].inset,
                  borderRadius: radius.round,
                  paddingHorizontal: space.x2,
                }}
              >
                <Text tone="muted" variant="meta">
                  {t.routingGroup.defaultTag}
                </Text>
              </View>
            ) : null}
            {selected ? (
              <SystemSymbol
                name={{ ios: 'checkmark', android: 'check' }}
                size={theme.type.title.line}
                color={theme.color.accent}
              />
            ) : null}
          </View>
        ) : undefined
      }
      title={row.title}
      detail={row.detail}
      accessibilityLabel={[
        row.name,
        isDefault ? t.routingGroup.defaultTag : undefined,
        row.detail,
        t.routingGroup.externalEngine,
      ]
        .filter(Boolean)
        .join(', ')}
    />
  );
}

export function ModelGroupPickerRow({
  group,
  front,
  currentTarget,
  models,
  engines,
  groups,
  usable,
  showCount,
  note,
  ...actions
}: RowActions & {
  group: ModelCatalogGroup;
  front: ModelCatalogEntry | undefined;
  currentTarget?: TurnTarget | undefined;
  models: readonly ModelCatalogEntry[];
  engines?: TurnTargetCatalog['engines'];
  groups: readonly ModelCatalogGroup[];
  usable: boolean;
  showCount: boolean;
  note?: string | undefined;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const restful = group.restingUntil;
  const color = usable ? theme.color.fg : theme.color.muted;
  const members = modelCatalogGroupMemberLabels(
    group,
    models,
    groups,
    t.routingGroup.engineRow,
    engines,
  );
  const frontLabel = t.modelSettings.groupFront(
    front === undefined ? (group.routes[0]?.model ?? '') : shortModelName(front),
  );
  const executed =
    currentTarget === undefined ? undefined : turnTargetLabel(currentTarget, { models, engines });
  const current =
    executed !== undefined
      ? t.modelSettings.groupCurrent(executed.short)
      : restful !== undefined
        ? restingLabel(restful)
        : front === undefined
          ? frontLabel
          : t.modelSettings.groupFront(`${front.modelName} · ${front.providerName}`);
  return (
    <SettingsRow
      {...actions}
      on={SHEET_GROUP}
      accessibilityLabel={[
        group.name,
        executed === undefined ? current : t.modelSettings.groupCurrent(executed.name),
        executed?.external ? t.routingGroup.externalEngine : undefined,
        ...members,
        note,
      ]
        .filter(Boolean)
        .join(', ')}
      leading={
        executed !== undefined ? (
          <ModelTargetIcon target={executed} size={theme.type.title.line} color={color} />
        ) : front === undefined || restful !== undefined ? (
          <RowIcon name="model" size={theme.type.title.line} color={color} />
        ) : (
          <ModelBrandIcon
            brand={modelEntryLabel(front).brand}
            size={theme.type.title.line}
            color={color}
          />
        )
      }
      title={group.name}
      detail={[
        ...(showCount ? [t.modelSettings.count(group.routes.length)] : []),
        executed !== undefined
          ? t.modelSettings.groupCurrent(executed.short)
          : restful === undefined
            ? frontLabel
            : restingLabel(restful),
        ...(note === undefined ? [] : [note]),
      ].join(' · ')}
      tone={usable ? 'fg' : 'muted'}
    />
  );
}
