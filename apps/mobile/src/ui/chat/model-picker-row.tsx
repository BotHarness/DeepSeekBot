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
  reason,
  isDefault = false,
  position,
  selected,
  ...actions
}: RowActions & {
  row: ReturnType<typeof routingGroupEnginePresentation>;
  reason?: string | undefined;
  position?: number;
  isDefault?: boolean;
}) {
  const theme = useDesignTheme();
  const t = useStrings();
  const tone = reason === undefined ? 'fg' : 'muted';
  const detail = reason === undefined ? row.detail : `${row.detail} · ${reason}`;
  const order = position === undefined ? '' : `${position}. `;
  return (
    <SettingsRow
      {...actions}
      selected={selected}
      on={SHEET_GROUP}
      leading={
        <ModelBrandIcon brand={row.brand} size={theme.type.title.line} color={theme.color[tone]} />
      }
      trailing={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
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
          <SystemSymbol
            name={{ ios: 'puzzlepiece.extension', android: 'extension' }}
            size={theme.type.meta.line}
            color={theme.color.muted}
          />
          {selected ? (
            <SystemSymbol
              name={{ ios: 'checkmark', android: 'check' }}
              size={theme.type.title.line}
              color={theme.color.accent}
            />
          ) : null}
        </View>
      }
      title={order + row.title}
      detail={detail}
      accessibilityLabel={[
        order + row.name,
        isDefault ? t.routingGroup.defaultTag : undefined,
        detail,
      ]
        .filter(Boolean)
        .join(', ')}
      tone={tone}
    />
  );
}

export function ModelGroupPickerRow({
  group,
  front,
  models,
  groups,
  usable,
  showCount,
  note,
  ...actions
}: RowActions & {
  group: ModelCatalogGroup;
  front: ModelCatalogEntry | undefined;
  models: readonly ModelCatalogEntry[];
  groups: readonly ModelCatalogGroup[];
  usable: boolean;
  showCount: boolean;
  note?: string | undefined;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const restful = group.restingUntil;
  const color = usable ? theme.color.fg : theme.color.muted;
  const members = modelCatalogGroupMemberLabels(group, models, groups, t.routingGroup.engineRow);
  const frontLabel = t.modelSettings.groupFront(
    front === undefined ? (group.routes[0]?.model ?? '') : shortModelName(front),
  );
  const current =
    restful !== undefined
      ? restingLabel(restful)
      : front === undefined
        ? frontLabel
        : t.modelSettings.groupFront(`${front.modelName} · ${front.providerName}`);
  return (
    <SettingsRow
      {...actions}
      on={SHEET_GROUP}
      accessibilityLabel={[group.name, current, ...members, note].filter(Boolean).join(', ')}
      leading={
        front === undefined || restful !== undefined ? (
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
        restful === undefined ? frontLabel : restingLabel(restful),
        ...(note === undefined ? [] : [note]),
      ].join(' · ')}
      tone={usable ? 'fg' : 'muted'}
    />
  );
}
