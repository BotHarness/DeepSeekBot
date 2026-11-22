import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import type { HostClient } from '@botharness/host-client/client';
import {
  modelSub,
  searchSubChoices,
  setModelSub,
  subEffortOptions,
  type AssignmentEffortTarget,
  type ModelScope,
  type SubAddOption,
} from '@botharness/host-client/model-settings';
import { SUB_MODEL_LIMIT, addSubChoice, setSubEffort } from '@botharness/host-client/preset-sub';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { SearchField } from '../primitives/search-field';
import { SettingsGroupItem, SettingsRow } from '../primitives/settings-row';
import { SheetPage } from '../primitives/sheet-page';
import { useStrings } from '../strings';
import { ModelTargetIcon } from './model-target-icon';
import { useModels } from './model-settings-screen';
import { SHEET_GROUP, SheetFailed, SheetLoading, SheetNote } from './sheet';
import { useEngineOptions } from './sub-choice-engines';
import { subChoiceKey, subChoiceView } from './sub-choice-text';

export function SubChoicePicker({
  client,
  scope,
  field,
  target,
}: {
  client: HostClient;
  scope: ModelScope;
  field: 'sub-add' | 'sub-effort';
  target?: AssignmentEffortTarget | undefined;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const router = useRouter();
  const models = useModels(client, scope);
  const engines = useEngineOptions(client);
  const [query, setQuery] = useState('');
  const value = models.value;
  const title = field === 'sub-add' ? t.subChoices.add : t.subChoices.effort;
  if (value === undefined)
    return (
      <SheetPage title={title}>
        {models.error === undefined ? (
          <SheetLoading />
        ) : (
          <SheetFailed message={t.modelFailed} onRetry={models.refresh} />
        )}
      </SheetPage>
    );
  const sub = modelSub(value);
  const back = () => router.back();
  if (field === 'sub-effort') {
    const info = target === undefined ? undefined : subEffortOptions(value, target, engines);
    const rows =
      info === undefined
        ? []
        : [{ id: '', name: t.modelSettings.providerDefault }, ...info.options];
    return (
      <SheetPage title={title}>
        <FlatList
          style={{ flex: 1 }}
          data={rows}
          keyExtractor={(row) => row.id || 'default'}
          contentContainerStyle={{ paddingVertical: space.x3 }}
          ListHeaderComponent={
            models.error === undefined ? undefined : <SheetNote>{models.error}</SheetNote>
          }
          renderItem={({ item, index }) => (
            <SettingsGroupItem
              first={index === 0}
              last={index === rows.length - 1}
              on={SHEET_GROUP}
            >
              <SettingsRow
                on={SHEET_GROUP}
                testID={`sub-effort-${item.id || 'default'}`}
                title={item.name}
                {...(info?.effort === item.id ? { control: { kind: 'check' as const } } : {})}
                onPress={
                  models.busy || info === undefined
                    ? undefined
                    : () =>
                        models.run(
                          () =>
                            setModelSub(
                              client,
                              scope,
                              value,
                              setSubEffort(
                                sub,
                                info.selection,
                                item.id,
                                info.options.map((entry) => entry.id),
                              ),
                            ),
                          back,
                        )
                }
              />
            </SettingsGroupItem>
          )}
        />
      </SheetPage>
    );
  }
  const options = searchSubChoices(value, query, engines);
  const modelsFull =
    sub.choices.filter((choice) => choice.kind === 'model').length >= SUB_MODEL_LIMIT;
  const add = (option: SubAddOption) =>
    models.run(() => setModelSub(client, scope, value, addSubChoice(sub, option.choice)), back);
  return (
    <SheetPage title={title}>
      <SearchField
        value={query}
        inset={space.x5}
        placeholder={t.subChoices.search}
        onChangeText={setQuery}
      />
      <FlatList
        style={{ flex: 1 }}
        data={options}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        keyExtractor={(option) => subChoiceKey(option.choice)}
        contentContainerStyle={{ paddingVertical: space.x3 }}
        ListHeaderComponent={
          <View>
            {modelsFull ? <SheetNote>{t.subChoices.full}</SheetNote> : null}
            {models.error === undefined ? null : <SheetNote>{models.error}</SheetNote>}
          </View>
        }
        ListEmptyComponent={<SheetNote>{t.modelSettings.noResults}</SheetNote>}
        renderItem={({ item, index }) => {
          const view = subChoiceView(value, item.choice, engines);
          return (
            <SettingsGroupItem
              first={index === 0}
              last={index === options.length - 1}
              on={SHEET_GROUP}
            >
              <SettingsRow
                on={SHEET_GROUP}
                testID={`sub-add-${subChoiceKey(item.choice)}`}
                title={view.title}
                detail={view.detail}
                leading={
                  <ModelTargetIcon
                    target={
                      view.external && view.brand !== undefined
                        ? { brand: view.brand, external: true }
                        : { brand: view.brand }
                    }
                    size={theme.type.title.line}
                    color={theme.color.fg}
                  />
                }
                onPress={models.busy ? undefined : () => add(item)}
              />
            </SettingsGroupItem>
          );
        }}
      />
    </SheetPage>
  );
}
