import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Keyboard, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import {
  applyModelPreset,
  currentModel,
  errorText,
  sameModel,
  type ModelChoice,
  type ModelPreset,
  type ModelRoute,
} from '@botharness/host-client/bot-settings';
import {
  applyModelFavoriteChanges,
  modelCatalogGroupFront,
  modelChoiceKey,
  type ModelCatalogEntry,
  type ModelCatalogGroup,
  type ModelFavoriteChange,
} from '@botharness/host-client/model-catalog';
import type { HostClient } from '@botharness/host-client/client';
import {
  inheritModel,
  modelRoutes,
  modelScopeKey,
  modelSettingsResource,
  saveModelPreset,
  searchModels,
  setAssignmentEfforts,
  setAssignmentGroupNote,
  setModelGroup,
  setModelRoute,
  toggleAssignmentGroup,
  toggleAssignmentModel,
  type AssignmentEffortTarget,
  type ModelField,
  type ModelScope,
  type ModelSettingsState,
} from '@botharness/host-client/model-settings';
import { modelFamilies } from '@botharness/host-client/shared/model-brand';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Chip } from '../primitives/chip';
import { FavoriteButton } from '../primitives/favorite-button';
import { modelFamilyKey, restingNotice } from './composer-labels';
import { AllowedEffortLinks, AllowedEffortPage } from './allowed-efforts';
import { GroupNotes } from './group-notes';
import { CurrentEngineModel, PickerLink, RouteIcon } from './model-route-label';
import { EffortBar, GroupEffortBar, GroupEffortLink, GroupEfforts } from './model-effort';
import {
  effortChoices,
  groupEffortChoices,
  groupEffortOf,
  keptEffort,
  keptGroupEffort,
  presetDetail,
  presetFront,
  routeEffortLabel,
  routeLabel,
} from './model-route-text';
import { ModelPickerFilters } from './model-picker-filters';
import { ModelGroupPickerRow, ModelPickerRow } from './model-picker-row';
import { RoutingGroupLink, type RoutingGroupLinkItem } from './routing-group-links';
import { Button } from '../primitives/button';
import { renderKeyboardFormScroll } from '../primitives/keyboard-form';
import { SearchField } from '../primitives/search-field';
import { SettingsGroupItem, SettingsRow, SettingsSection } from '../primitives/settings-row';
import { SheetPage } from '../primitives/sheet-page';
import { TextField } from '../primitives/text-field';
import { useStrings, t } from '../strings';
import { SHEET_GROUP, SheetCallout, SheetFailed, SheetLoading, SheetNote } from './sheet';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { RowIcon } from '../primitives/row-icon';

const FAVORITES = 'favorites';
const ALL = 'all';
const GROUPS = 'groups';
const PRESETS = 'presets';

type PickerRow =
  | { kind: 'model'; entry: ModelCatalogEntry }
  | { kind: 'group'; group: ModelCatalogGroup; front: ModelCatalogEntry | undefined }
  | { kind: 'preset'; preset: ModelPreset };

function useModels(client: HostClient, scope: ModelScope) {
  const key = modelScopeKey(scope);
  const resource = useMemo(() => modelSettingsResource(client, scope), [client, key]);
  const [value, setValue] = useState(resource.peek);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [changes, setChanges] = useState<readonly ModelFavoriteChange[]>([]);
  const pending = useRef(false);
  const generation = useRef(0);
  const refresh = useCallback(() => {
    const request = generation.current;
    void resource.refresh().then(
      (next) => {
        if (generation.current === request) {
          setValue(next);
          setError(undefined);
        }
      },
      (cause: unknown) => {
        if (generation.current === request) setError(errorText(cause));
      },
    );
  }, [resource]);
  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => {
        generation.current += 1;
      };
    }, [refresh]),
  );
  const run = (work: () => Promise<void>, done?: () => void) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    const request = ++generation.current;
    void resource
      .write(work)
      .then(
        async () => {
          try {
            const next = await resource.refresh();
            setValue(next);
            if (generation.current === request) {
              done?.();
            }
          } catch (cause) {
            if (generation.current === request) setError(errorText(cause));
          }
        },
        (cause: unknown) => {
          if (generation.current === request) setError(errorText(cause));
        },
      )
      .finally(() => {
        pending.current = false;
        setBusy(false);
      });
  };
  const favorites = applyModelFavoriteChanges(value?.favorites ?? [], changes);
  const favorite = (choice: ModelChoice, on: boolean) => {
    const change: ModelFavoriteChange = { choice, favorite: on };
    generation.current += 1;
    setChanges((current) => [...current, change]);
    setError(undefined);
    const settle = () => setChanges((current) => current.filter((entry) => entry !== change));
    void resource.favorite(choice, on).then(
      (list) => {
        setValue((current) => (current === undefined ? current : { ...current, favorites: list }));
        settle();
      },
      (cause: unknown) => {
        settle();
        setError(errorText(cause));
      },
    );
  };
  return { value, error, busy, refresh, run, favorites, favorite };
}

export function ModelsView({
  client,
  scope,
  picker,
  effortTarget,
}: {
  client: HostClient;
  scope: ModelScope;
  picker?: ModelField | undefined;
  effortTarget?: AssignmentEffortTarget | undefined;
}) {
  const t = useStrings();
  const router = useRouter();
  const models = useModels(client, scope);
  const theme = useDesignTheme();
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState<string>();
  const [held, setHeld] = useState<ReadonlySet<string>>();
  const [restNotice, setRestNotice] = useState<string>();
  const chooseFamily = (next: string) => {
    setFamily(next);
    setHeld(undefined);
    setRestNotice(undefined);
  };
  const [name, setName] = useState<string>();
  const [saved, setSaved] = useState(false);
  const value = models.value;
  const openPicker = (field: ModelField, target?: AssignmentEffortTarget) => {
    const extra =
      target === undefined
        ? {}
        : target.kind === 'group'
          ? { group: target.id }
          : { provider: target.provider, model: target.model };
    if (scope.kind === 'bot')
      router.push({
        pathname: '/bot/[slug]/model-picker',
        params: { slug: scope.slug, field, ...extra },
      });
    else
      router.push({
        pathname: '/settings/model-picker',
        params: { field, ...extra, ...(scope.kind === 'preset' ? { id: scope.id } : {}) },
      });
  };
  const title =
    picker === 'allowed'
      ? t.modelSettings.allowed
      : picker?.endsWith('-effort')
        ? t.modelSettings.effort
        : picker === 'assignment'
          ? t.modelSettings.assignment
          : picker === 'orchestrator'
            ? scope.kind === 'global'
              ? t.modelSettings.global
              : t.modelSettings.orchestrator
            : scope.kind === 'preset'
              ? (value?.preset?.name ?? t.modelPresets)
              : t.modelSettings.title;
  const frame = (body: ReactNode) => (
    <SheetPage title={title}>
      <KeyboardAvoidingView enabled={picker !== undefined} behavior="padding" style={{ flex: 1 }}>
        {body}
      </KeyboardAvoidingView>
    </SheetPage>
  );
  if (value === undefined)
    return frame(
      models.error === undefined ? (
        <SheetLoading />
      ) : (
        <SheetFailed message={t.modelFailed} onRetry={models.refresh} />
      ),
    );
  const routes = modelRoutes(value);
  const banner =
    models.error === undefined ? null : (
      <View style={{ gap: space.x3, paddingBottom: space.x3 }}>
        <SheetCallout tone="danger">{`${t.settingFailed} ${models.error}`}</SheetCallout>
        <View style={{ paddingHorizontal: space.x5 }}>
          <Button label={t.retry} onPress={models.refresh} disabled={models.busy} />
        </View>
      </View>
    );

  if (picker !== undefined) {
    const assignment = picker.startsWith('assignment');
    const current = assignment ? routes.assignmentDefault : routes.orchestrator;
    const currentEntry = value.models.find((entry) => sameModel(entry, current));
    const choose = (route: ModelRoute, stay = false) => {
      models.run(
        () =>
          setModelRoute(client, scope, value, assignment ? 'assignment' : 'orchestrator', route),
        () => {
          if (stay) return;
          Keyboard.dismiss();
          router.back();
        },
      );
    };
    const fieldGroupId = assignment
      ? routes.groups.assignmentDefaultGroupId
      : scope.kind === 'global'
        ? value.defaultGroupId
        : routes.groups.orchestratorGroupId;
    const effortGroup = value.groups?.find((group) => group.id === fieldGroupId);
    const chooseEffort = (effort: string) =>
      current === undefined
        ? undefined
        : choose({
            provider: current.provider,
            model: current.model,
            ...(effort === '' ? {} : { reasoningEffort: effort }),
          });
    const field = assignment ? 'assignment' : 'orchestrator';
    const groupEffort = groupEffortOf(routes.groups, assignment);
    const pickGroup = (group: ModelCatalogGroup, effort: string, stay: boolean) =>
      models.run(
        () => setModelGroup(client, scope, value, group.id, field, effort),
        () => {
          if (stay) return;
          Keyboard.dismiss();
          router.back();
        },
      );
    const effortBar = (group: ModelCatalogGroup | undefined) =>
      group === undefined ? (
        <EffortBar
          options={effortChoices(currentEntry)}
          current={current === undefined ? undefined : (current.reasoningEffort ?? '')}
          busy={models.busy}
          onChange={chooseEffort}
        />
      ) : (
        <GroupEffortBar
          value={value}
          group={group}
          effort={groupEffort}
          busy={models.busy}
          onChange={(effort) => pickGroup(group, effort, true)}
        />
      );
    if (picker === 'allowed-effort')
      return frame(
        effortTarget === undefined ? (
          <SheetNote>{t.modelSettings.noResults}</SheetNote>
        ) : (
          <AllowedEffortPage
            value={value}
            target={effortTarget}
            busy={models.busy}
            header={banner}
            onSave={(allowed, effort) =>
              models.run(() =>
                setAssignmentEfforts(client, scope, value, effortTarget, allowed, effort),
              )
            }
          />
        ),
      );
    if (picker.endsWith('-effort'))
      return frame(
        effortGroup !== undefined && groupEffortChoices(value, effortGroup).length === 0 ? (
          <GroupEfforts value={value} group={effortGroup} header={banner} />
        ) : (
          <View>
            {banner}
            {effortBar(effortGroup)}
          </View>
        ),
      );
    const families = modelFamilies(
      value.models.map((entry) => ({
        provider: entry.provider,
        model: entry.model,
        name: entry.modelName,
      })),
    );
    const groups = picker === 'orchestrator' || scope.kind !== 'global' ? (value.groups ?? []) : [];
    const listedGroups = routes.groups.assignmentGroups ?? [];
    const currentGroup =
      picker === 'allowed' ? undefined : groups.find((group) => group.id === fieldGroupId);
    const starredKeys = new Set(models.favorites.map(modelChoiceKey));
    const rowKey = (row: PickerRow) =>
      row.kind === 'preset'
        ? modelChoiceKey({ kind: 'preset', id: row.preset.id })
        : row.kind === 'group'
          ? modelChoiceKey({ kind: 'group', id: row.group.id })
          : modelChoiceKey({ kind: 'model', provider: row.entry.provider, model: row.entry.model });
    const starredRow = (row: PickerRow) => starredKeys.has(rowKey(row));
    const starredModel = (entry: ModelRoute) =>
      starredKeys.has(
        modelChoiceKey({ kind: 'model', provider: entry.provider, model: entry.model }),
      );
    const listedRow = (row: PickerRow) =>
      held === undefined ? starredRow(row) : held.has(rowKey(row));
    const groupRows: PickerRow[] = groups.map((group) => {
      const front = modelCatalogGroupFront(group, value.models);
      return {
        kind: 'group',
        group,
        front: value.models.find((entry) => front !== undefined && sameModel(entry, front)),
      };
    });
    const presetRows: PickerRow[] =
      picker === 'orchestrator' && scope.kind === 'bot'
        ? value.presets.map((preset) => ({ kind: 'preset', preset }))
        : [];
    const presetPart = (groupId: string | undefined, route: ModelRoute | undefined) => {
      const group = value.groups?.find((entry) => entry.id === groupId);
      if (group !== undefined) return group.name;
      if (route === undefined) return t.modelSettings.presetInherited;
      const entry = value.models.find((item) => sameModel(item, route));
      return entry?.modelName ?? route.model;
    };
    const favoriteCount =
      value.models.filter(starredModel).length +
      groupRows.filter(starredRow).length +
      presetRows.filter(starredRow).length;
    const showFavorites = !picker.endsWith('-effort') && favoriteCount > 0;
    const filter =
      family === FAVORITES || (family === undefined && showFavorites)
        ? showFavorites
          ? FAVORITES
          : ALL
        : family === undefined
          ? ALL
          : family;
    const shownFamily =
      families.some((entry) => (entry.brand ?? 'other') === filter) ||
      (filter === GROUPS && groups.length > 0) ||
      (filter === PRESETS && presetRows.length > 0)
        ? filter
        : filter === FAVORITES
          ? FAVORITES
          : ALL;
    const needle = query.trim().toLowerCase();
    const found: PickerRow[] = [
      ...presetRows.filter(
        (row) =>
          row.kind === 'preset' &&
          (shownFamily === PRESETS || shownFamily === FAVORITES || needle !== '') &&
          (needle === '' || row.preset.name.toLowerCase().includes(needle)),
      ),
      ...groupRows.filter(
        (row) =>
          row.kind === 'group' &&
          (needle === '' ||
            [row.group.name, row.front?.modelName ?? ''].some((part) =>
              part.toLowerCase().includes(needle),
            )),
      ),
      ...searchModels(value.models, query).map((entry): PickerRow => ({ kind: 'model', entry })),
    ].filter((row) =>
      shownFamily === FAVORITES
        ? needle !== '' || listedRow(row)
        : shownFamily === ALL ||
          (shownFamily === PRESETS
            ? row.kind === 'preset'
            : shownFamily === GROUPS
              ? row.kind === 'group'
              : row.kind === 'model' && modelFamilyKey(row.entry) === shownFamily),
    );
    const entries =
      shownFamily === FAVORITES
        ? found
        : [...found.filter(listedRow), ...found.filter((row) => !listedRow(row))];
    const lastGroup = entries.findLastIndex((row) => row.kind === 'group');
    const rows: (PickerRow | { kind: 'notes' })[] =
      picker === 'allowed' && listedGroups.length > 0 && lastGroup >= 0
        ? [...entries.slice(0, lastGroup + 1), { kind: 'notes' }, ...entries.slice(lastGroup + 1)]
        : entries;
    const first = (index: number) => index === 0 || rows[index - 1]?.kind === 'notes';
    const last = (index: number) => index === rows.length - 1 || rows[index + 1]?.kind === 'notes';
    const star = (row: PickerRow, on: boolean) => {
      if (family === undefined) setFamily(shownFamily);
      setHeld(
        (current) =>
          current ??
          new Set(
            [
              ...presetRows,
              ...groupRows,
              ...value.models.map((entry): PickerRow => ({ kind: 'model', entry })),
            ]
              .filter(starredRow)
              .map(rowKey),
          ),
      );
      models.favorite(
        row.kind === 'preset'
          ? { kind: 'preset', id: row.preset.id }
          : row.kind === 'group'
            ? { kind: 'group', id: row.group.id }
            : { kind: 'model', provider: row.entry.provider, model: row.entry.model },
        on,
      );
    };
    return frame(
      <>
        <SearchField
          value={query}
          inset={space.x5}
          placeholder={t.modelSettings.search}
          onChangeText={setQuery}
        />
        {families.length > 1 || showFavorites || groups.length > 0 || presetRows.length > 0 ? (
          <ModelPickerFilters>
            {showFavorites ? (
              <Chip
                testID="model-family-favorites"
                label={t.modelSettings.favorites}
                count={favoriteCount}
                selected={shownFamily === FAVORITES}
                onPress={() => chooseFamily(FAVORITES)}
              />
            ) : null}
            <Chip
              testID="model-family-all"
              label={t.modelSettings.allFamilies}
              count={value.models.length}
              selected={shownFamily === ALL}
              onPress={() => chooseFamily(ALL)}
            />
            {presetRows.length > 0 ? (
              <Chip
                testID="model-family-presets"
                label={t.modelSettings.presets}
                count={presetRows.length}
                selected={shownFamily === PRESETS}
                onPress={() => chooseFamily(shownFamily === PRESETS ? ALL : PRESETS)}
              />
            ) : null}
            {groups.length > 0 ? (
              <Chip
                testID="model-family-groups"
                label={t.modelSettings.groups}
                count={groups.length}
                selected={shownFamily === GROUPS}
                onPress={() => chooseFamily(shownFamily === GROUPS ? ALL : GROUPS)}
              />
            ) : null}
            {families.length > 1
              ? families.map((entry) => {
                  const key = entry.brand ?? 'other';
                  return (
                    <Chip
                      key={key}
                      testID={`model-family-${key}`}
                      label={entry.title ?? t.modelSettings.otherFamily}
                      count={entry.count}
                      selected={shownFamily === key}
                      onPress={() => chooseFamily(shownFamily === key ? ALL : key)}
                    />
                  );
                })
              : null}
          </ModelPickerFilters>
        ) : null}
        {banner}
        {restNotice === undefined ? null : <SheetCallout tone="warning">{restNotice}</SheetCallout>}
        {models.busy ? <LoadingIndicator /> : null}
        <FlatList
          style={{ flex: 1 }}
          data={rows}
          keyExtractor={(row) => (row.kind === 'notes' ? 'group-notes' : rowKey(row))}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            picker === 'allowed' ? (
              <SheetNote>{t.modelSettings.allowedHint}</SheetNote>
            ) : picker === 'orchestrator' && scope.kind === 'bot' && currentGroup === undefined ? (
              <CurrentEngineModel value={value} />
            ) : undefined
          }
          ListEmptyComponent={<SheetNote>{t.modelSettings.noResults}</SheetNote>}
          renderItem={({ item: row, index }) => {
            if (row.kind === 'notes')
              return (
                <GroupNotes
                  listed={listedGroups}
                  groups={value.groups ?? []}
                  options={routes.groups.assignmentGroupOptions ?? []}
                  busy={models.busy}
                  onSave={(id, note) =>
                    models.run(() => setAssignmentGroupNote(client, scope, value, id, note))
                  }
                />
              );
            if (row.kind === 'preset') {
              const { preset } = row;
              const selected = value.plan?.sourcePresetId === preset.id;
              const isFavorite = starredRow(row);
              return (
                <SettingsGroupItem first={first(index)} last={last(index)} on={SHEET_GROUP}>
                  <SettingsRow
                    on={SHEET_GROUP}
                    testID={`model-preset-${preset.id}`}
                    leading={
                      <RowIcon name="preset" size={theme.type.title.line} color={theme.color.fg} />
                    }
                    title={preset.name}
                    detail={t.modelSettings.presetRoutes(
                      presetPart(preset.orchestratorGroupId, preset.orchestrator),
                      presetPart(preset.assignmentDefaultGroupId, preset.assignmentDefault),
                    )}
                    selected={selected}
                    control={selected ? { kind: 'check' } : undefined}
                    accessory={
                      <FavoriteButton
                        testID={`model-favorite-preset-${preset.id}`}
                        label={
                          isFavorite
                            ? t.modelSettings.favoriteRemove(preset.name)
                            : t.modelSettings.favoriteAdd(preset.name)
                        }
                        favorite={isFavorite}
                        disabled={models.busy}
                        onPress={() => star(row, !isFavorite)}
                      />
                    }
                    onPress={
                      models.busy || scope.kind !== 'bot'
                        ? undefined
                        : () =>
                            models.run(
                              async () => {
                                await applyModelPreset(client, scope.slug, preset.id);
                              },
                              () => {
                                Keyboard.dismiss();
                                router.back();
                              },
                            )
                    }
                  />
                </SettingsGroupItem>
              );
            }
            if (row.kind === 'group') {
              const { group, front } = row;
              const selected =
                picker === 'allowed'
                  ? listedGroups.includes(group.id)
                  : currentGroup?.id === group.id;
              const required =
                picker === 'allowed' && routes.groups.assignmentDefaultGroupId === group.id;
              const note = routes.groups.assignmentGroupOptions?.find(
                (option) => option.group === group.id,
              )?.note;
              const usable =
                group.restingUntil === undefined &&
                group.routes.some(
                  (route) =>
                    value.models.find((entry) => sameModel(entry, route))?.credential === undefined,
                );
              const isFavorite = starredRow(row);
              return (
                <SettingsGroupItem first={first(index)} last={last(index)} on={SHEET_GROUP}>
                  <ModelGroupPickerRow
                    group={group}
                    front={front}
                    currentTarget={
                      scope.kind === 'bot' && picker === 'orchestrator' && selected
                        ? value.currentTarget
                        : undefined
                    }
                    models={value.models}
                    groups={value.groups ?? []}
                    usable={usable}
                    showCount={picker !== 'orchestrator'}
                    note={picker === 'allowed' ? note : undefined}
                    testID={`model-group-${group.id}`}
                    selected={selected}
                    control={selected ? { kind: 'check' } : undefined}
                    accessory={
                      <FavoriteButton
                        testID={`model-favorite-group-${group.id}`}
                        label={
                          isFavorite
                            ? t.modelSettings.favoriteRemove(group.name)
                            : t.modelSettings.favoriteAdd(group.name)
                        }
                        favorite={isFavorite}
                        disabled={models.busy}
                        onPress={() => star(row, !isFavorite)}
                      />
                    }
                    onPress={
                      models.busy || required || (selected && picker !== 'allowed')
                        ? undefined
                        : picker === 'allowed' && selected
                          ? () =>
                              models.run(() =>
                                toggleAssignmentGroup(client, scope, value, group.id),
                              )
                          : restingNotice(group.name, group) !== undefined
                            ? () => setRestNotice(restingNotice(group.name, group))
                            : !usable
                              ? undefined
                              : picker === 'allowed'
                                ? () =>
                                    models.run(() =>
                                      toggleAssignmentGroup(client, scope, value, group.id),
                                    )
                                : () =>
                                    pickGroup(
                                      group,
                                      keptGroupEffort(
                                        value,
                                        group,
                                        currentGroup === undefined
                                          ? (current?.reasoningEffort ?? '')
                                          : groupEffort,
                                      ),
                                      groupEffortChoices(value, group).length > 0,
                                    )
                    }
                  />
                </SettingsGroupItem>
              );
            }
            const item = row.entry;
            const selected =
              picker === 'allowed'
                ? routes.assignmentModels.some((option) => sameModel(option, item))
                : currentGroup === undefined && sameModel(item, current);
            const usable = item.credential === undefined && item.restingUntil === undefined;
            const required = picker === 'allowed' && sameModel(item, routes.assignmentDefault);
            const isFavorite = starredRow(row);
            return (
              <SettingsGroupItem first={first(index)} last={last(index)} on={SHEET_GROUP}>
                <ModelPickerRow
                  entry={item}
                  selected={selected}
                  control={selected ? { kind: 'check' } : undefined}
                  accessory={
                    <FavoriteButton
                      testID={`model-favorite-${item.provider}-${item.model}`}
                      label={
                        isFavorite
                          ? t.modelSettings.favoriteRemove(item.modelName)
                          : t.modelSettings.favoriteAdd(item.modelName)
                      }
                      favorite={isFavorite}
                      disabled={models.busy}
                      onPress={() => star(row, !isFavorite)}
                    />
                  }
                  onPress={
                    models.busy || required
                      ? undefined
                      : restingNotice(item.modelName, item) !== undefined &&
                          !(picker === 'allowed' && selected)
                        ? () => setRestNotice(restingNotice(item.modelName, item))
                        : !usable && !(picker === 'allowed' && selected)
                          ? undefined
                          : () => {
                              if (picker === 'allowed')
                                models.run(() => toggleAssignmentModel(client, scope, value, item));
                              else {
                                const reasoningEffort = keptEffort(item, current);
                                choose(
                                  {
                                    provider: item.provider,
                                    model: item.model,
                                    ...(reasoningEffort === '' ? {} : { reasoningEffort }),
                                  },
                                  effortChoices(item).length > 0,
                                );
                              }
                            }
                  }
                />
              </SettingsGroupItem>
            );
          }}
        />
        {picker === 'allowed' ? null : effortBar(currentGroup)}
      </>,
    );
  }

  const showPreset = scope.kind === 'preset';
  const presets = showPreset ? [] : value.presets;
  const settingsRows: (ModelPreset | RoutingGroupLinkItem)[] = [...presets];
  if (scope.kind === 'global') {
    for (const group of value.groups ?? []) settingsRows.push({ kind: 'group', group });
    settingsRows.push({ kind: 'add' });
  }
  const groupName = (id: string | undefined) =>
    id === undefined ? undefined : (value.groups?.find((group) => group.id === id)?.name ?? id);
  const orchestratorGroup =
    scope.kind === 'preset'
      ? groupName(routes.groups.orchestratorGroupId)
      : currentModel(value).group;
  const assignmentGroup = groupName(routes.groups.assignmentDefaultGroupId);
  const assignmentCatalogGroup = value.groups?.find(
    (group) => group.id === routes.groups.assignmentDefaultGroupId,
  );
  const assignmentShown =
    assignmentCatalogGroup === undefined ||
    assignmentCatalogGroup.routes.some((route) => sameModel(route, routes.assignmentDefault))
      ? routes.assignmentDefault
      : modelCatalogGroupFront(assignmentCatalogGroup, value.models);
  const form = (
    <View style={{ gap: space.x4 }}>
      <SheetNote>
        {showPreset
          ? t.modelSettings.presetHint
          : scope.kind === 'global'
            ? t.modelSettings.globalHint
            : t.modelSettings.botHint}
      </SheetNote>
      {banner}
      {models.busy ? <LoadingIndicator /> : null}
      <View style={{ paddingHorizontal: space.x5 }}>
        <SettingsSection
          title={scope.kind === 'global' ? t.modelSettings.global : t.modelSettings.title}
          on={SHEET_GROUP}
        >
          {scope.kind === 'bot' && value.currentTarget?.kind === 'engine' ? (
            <CurrentEngineModel
              value={value}
              heading={t.modelSettings.orchestrator}
              onPress={models.busy ? undefined : () => openPicker('orchestrator')}
            />
          ) : (
            <PickerLink
              label={
                scope.kind === 'global' ? t.modelSettings.global : t.modelSettings.orchestrator
              }
              detail={
                orchestratorGroup !== undefined
                  ? `${orchestratorGroup} · ${routeLabel(value, routes.orchestrator)}`
                  : routeEffortLabel(value, routes.orchestrator)
              }
              leading={<RouteIcon value={value} route={routes.orchestrator} />}
              onPress={models.busy ? undefined : () => openPicker('orchestrator')}
            />
          )}
          {orchestratorGroup === undefined ? null : (
            <GroupEffortLink
              value={value}
              groupId={
                scope.kind === 'global' ? value.defaultGroupId : routes.groups.orchestratorGroupId
              }
              effort={groupEffortOf(routes.groups, false)}
              onPress={models.busy ? undefined : () => openPicker('orchestrator-effort')}
            />
          )}
          {scope.kind === 'global' ? null : (
            <>
              <PickerLink
                label={t.modelSettings.assignment}
                detail={
                  assignmentGroup !== undefined
                    ? `${assignmentGroup} · ${routeLabel(value, assignmentShown)}`
                    : routeEffortLabel(value, routes.assignmentDefault)
                }
                leading={
                  <RouteIcon
                    value={value}
                    route={
                      assignmentGroup !== undefined ? assignmentShown : routes.assignmentDefault
                    }
                  />
                }
                onPress={models.busy ? undefined : () => openPicker('assignment')}
              />
              {assignmentGroup === undefined ? null : (
                <GroupEffortLink
                  value={value}
                  groupId={assignmentCatalogGroup?.id}
                  effort={groupEffortOf(routes.groups, true)}
                  onPress={models.busy ? undefined : () => openPicker('assignment-effort')}
                />
              )}
              <PickerLink
                label={t.modelSettings.allowed}
                detail={
                  routes.assignmentDefault === undefined
                    ? t.modelSettings.inherited
                    : t.modelSettings.count(
                        routes.assignmentModels.length +
                          (routes.groups.assignmentGroups?.length ?? 0),
                      )
                }
                onPress={
                  models.busy || routes.assignmentDefault === undefined
                    ? undefined
                    : () => openPicker('allowed')
                }
              />
            </>
          )}
          {scope.kind === 'bot' ? (
            <SettingsRow
              on={SHEET_GROUP}
              title={value.plan === undefined ? t.modelSettings.inherited : t.modelSettings.inherit}
              {...(value.plan?.sourcePresetName ? { detail: value.plan.sourcePresetName } : {})}
              tone="accent"
              onPress={
                models.busy || value.plan === undefined
                  ? undefined
                  : () => models.run(() => inheritModel(client, scope.slug, value))
              }
            />
          ) : null}
        </SettingsSection>
      </View>
      {scope.kind === 'global' || routes.assignmentDefault === undefined ? null : (
        <AllowedEffortLinks
          value={value}
          onOpen={models.busy ? undefined : (target) => openPicker('allowed-effort', target)}
        />
      )}
      <View style={{ paddingHorizontal: space.x5, gap: space.x3 }}>
        <TextField
          value={name ?? value.preset?.name ?? ''}
          onChangeText={(next) => {
            setName(next);
            setSaved(false);
          }}
          accessibilityLabel={t.modelSettings.name}
          placeholder={t.modelSettings.name}
        />
        <Button
          label={showPreset ? t.modelSettings.rename : t.modelSettings.create}
          busy={models.busy}
          disabled={
            (name ?? value.preset?.name ?? '').trim() === '' || routes.orchestrator === undefined
          }
          onPress={() =>
            models.run(async () => {
              const id = await saveModelPreset(
                client,
                value,
                name ?? value.preset?.name ?? '',
                showPreset,
              );
              setSaved(true);
              if (!showPreset) setName('');
              if (scope.kind === 'global')
                router.push({ pathname: '/settings/model-preset', params: { id } });
            })
          }
        />
      </View>
      {saved ? <SheetNote>{t.modelSettings.saved}</SheetNote> : null}
      {presets.length === 0 ? null : <SheetNote>{t.modelPresets}</SheetNote>}
    </View>
  );
  return frame(
    <FlatList
      style={{ flex: 1 }}
      data={settingsRows}
      renderScrollComponent={renderKeyboardFormScroll}
      keyExtractor={(item) =>
        'kind' in item
          ? item.kind === 'add'
            ? 'group-add'
            : `group:${item.group.id}`
          : `preset:${item.id}`
      }
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListHeaderComponent={form}
      contentContainerStyle={{ paddingVertical: space.x3 }}
      renderItem={({ item, index }) =>
        'kind' in item ? (
          <RoutingGroupLink
            item={item}
            first={index === presets.length}
            models={value.models}
            groups={value.groups ?? []}
          />
        ) : (
          <SettingsGroupItem
            first={index === 0}
            last={index === presets.length - 1}
            on={SHEET_GROUP}
          >
            <SettingsRow
              on={SHEET_GROUP}
              title={item.name}
              leading={<RouteIcon value={value} route={presetFront(value, item)} />}
              detail={presetDetail(value, item)}
              disclosure={scope.kind === 'global'}
              selected={scope.kind === 'bot' && value.plan?.sourcePresetId === item.id}
              onPress={
                models.busy
                  ? undefined
                  : () => {
                      if (scope.kind === 'global')
                        router.push({
                          pathname: '/settings/model-preset',
                          params: { id: item.id },
                        });
                      else if (scope.kind === 'bot')
                        models.run(async () => {
                          await applyModelPreset(client, scope.slug, item.id);
                        });
                    }
              }
            />
          </SettingsGroupItem>
        )
      }
    />,
  );
}
