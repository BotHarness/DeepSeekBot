import {
  modelCatalogGroupMemberLabels,
  type routingGroupEnginePresentation,
  type ModelCatalogEntry,
  type ModelCatalogGroup,
} from '@botharness/host-client/model-catalog';

import { useDesignTheme } from '../design/theme';
import { RowIcon } from '../primitives/row-icon';
import { SettingsRow, type SettingsRowProps } from '../primitives/settings-row';
import { SystemSymbol } from '../primitives/system-symbol';
import { useStrings } from '../strings';
import { modelEntryLabel, restingLabel } from './composer-labels';
import { ModelBrandIcon } from './model-brand-icon';
import { shortModelName } from './model-route-text';
import { SHEET_GROUP } from './sheet';

type RowActions = Pick<
  SettingsRowProps,
  'onPress' | 'selected' | 'control' | 'accessory' | 'testID' | 'disclosure'
>;

export function ModelPickerRow({ entry, ...actions }: RowActions & { entry: ModelCatalogEntry }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const label = modelEntryLabel(entry);
  const usable = entry.credential === undefined && entry.restingUntil === undefined;
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
      title={label.name}
      accessibilityLabel={`${entry.modelName}, ${entry.providerName}`}
      detail={
        entry.credential === 'missing'
          ? t.modelNeedsKey(entry.providerName)
          : entry.credential === 'invalid'
            ? t.modelKeyInvalid(entry.providerName)
            : entry.restingUntil !== undefined
              ? `${entry.providerName} · ${restingLabel(entry.restingUntil)}`
              : entry.providerName
      }
      tone={usable ? 'fg' : 'muted'}
    />
  );
}

export function ModelEnginePickerRow({
  row,
  reason,
  ...actions
}: RowActions & {
  row: ReturnType<typeof routingGroupEnginePresentation>;
  reason?: string | undefined;
}) {
  const theme = useDesignTheme();
  const tone = reason === undefined ? 'fg' : 'muted';
  const detail = reason === undefined ? row.detail : `${row.detail} · ${reason}`;
  return (
    <SettingsRow
      {...actions}
      on={SHEET_GROUP}
      leading={
        <ModelBrandIcon brand={row.brand} size={theme.type.title.line} color={theme.color[tone]} />
      }
      trailing={
        <SystemSymbol
          name={{ ios: 'puzzlepiece.extension', android: 'extension' }}
          size={theme.type.meta.line}
          color={theme.color.muted}
        />
      }
      title={row.title}
      detail={detail}
      accessibilityLabel={`${row.name}, ${detail}`}
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
