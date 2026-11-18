import type { ReactElement } from 'react';
import { FlatList, View } from 'react-native';

import { sameModel, type ModelRoute } from '@botharness/host-client/bot-settings';
import type { ModelCatalogEntry, ModelCatalogGroup } from '@botharness/host-client/model-catalog';
import type { ModelSettingsState } from '@botharness/host-client/model-settings';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Segmented } from '../primitives/segmented';
import { SettingsGroupItem, SettingsRow } from '../primitives/settings-row';
import { useStrings } from '../strings';
import { modelEntryLabel } from './composer-labels';
import { ModelBrandIcon } from './model-brand-icon';
import { effortChoices, effortLabel, routeLabel } from './model-route-text';
import { SHEET_GROUP, SheetNote } from './sheet';

export function EffortBar({
  entry,
  route,
  busy,
  onChange,
}: {
  entry: ModelCatalogEntry | undefined;
  route: ModelRoute | undefined;
  busy: boolean;
  onChange(effort: string): void;
}) {
  const t = useStrings();
  const options = effortChoices(entry);
  if (options.length === 0 || route === undefined) return null;
  const current = route.reasoningEffort ?? '';
  return (
    <View testID="model-effort-bar" style={{ paddingVertical: space.x3 }}>
      <SheetNote>{t.modelSettings.effort}</SheetNote>
      <View style={{ paddingHorizontal: space.x5 }}>
        <Segmented
          compact
          label={t.modelSettings.effort}
          value={options.some((option) => option.value === current) ? current : ''}
          options={options}
          disabled={busy}
          onChange={(effort) => {
            if (effort !== current) onChange(effort);
          }}
        />
      </View>
    </View>
  );
}

export function GroupEfforts({
  value,
  group,
  header,
}: {
  value: ModelSettingsState;
  group: ModelCatalogGroup;
  header: ReactElement | null;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <FlatList
      data={group.routes}
      keyExtractor={(route) => `${route.provider}/${route.model}`}
      ListHeaderComponent={
        <>
          {header}
          <SheetNote>{t.modelSettings.groupEffortHint}</SheetNote>
        </>
      }
      renderItem={({ item: route, index }) => {
        const entry = value.models.find((item) => sameModel(item, route));
        return (
          <SettingsGroupItem
            first={index === 0}
            last={index === group.routes.length - 1}
            on={SHEET_GROUP}
          >
            <SettingsRow
              on={SHEET_GROUP}
              testID={`model-group-effort-${index}`}
              leading={
                <ModelBrandIcon
                  brand={entry === undefined ? undefined : modelEntryLabel(entry).brand}
                  size={theme.type.title.line}
                  color={theme.color.fg}
                />
              }
              title={routeLabel(value, route)}
              detail={effortLabel(value, route)}
            />
          </SettingsGroupItem>
        );
      }}
    />
  );
}
