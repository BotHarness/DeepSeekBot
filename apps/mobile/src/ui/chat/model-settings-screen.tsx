import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Keyboard, ScrollView, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import {
  applyModelPreset,
  currentModel,
  errorText,
  sameModel,
  type ModelChoice,
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
import { useHostSession } from '../../host/host-session';
import {
  inheritModel,
  modelRoutes,
  modelScopeKey,
  modelSettingsResource,
  saveModelPreset,
  searchModels,
  setModelGroup,
  setModelRoute,
  toggleAssignmentGroup,
  toggleAssignmentModel,
  type ModelField,
  type ModelScope,
  type ModelSettingsState,
} from '@botharness/host-client/model-settings';
import { modelFamilies } from '@botharness/host-client/shared/model-brand';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Chip } from '../primitives/chip';
import { FavoriteButton } from '../primitives/favorite-button';
import { modelEntryLabel, modelFamilyKey, restingLabel, restingNotice } from './composer-labels';
import { ModelBrandIcon } from './model-brand-icon';
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

type PickerRow =
  | { kind: 'model'; entry: ModelCatalogEntry }
  | { kind: 'group'; group: ModelCatalogGroup; front: ModelCatalogEntry | undefined };

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

function routeLabel(value: ModelSettingsState, route: ModelRoute | undefined): string {
  if (route === undefined) return t.modelSettings.inherited;
  const model = value.models.find((entry) => sameModel(entry, route));
  return `${model?.modelName ?? route.model} · ${model?.providerName ?? route.provider}`;
}

function PickerLink({
  label,
  detail,
  onPress,
}: {
  label: string;
  detail: string;
  onPress?: (() => void) | undefined;
}) {
  return (
    <SettingsRow on={SHEET_GROUP} title={label} detail={detail} disclosure onPress={onPress} />
  );
}

function ModelsView({
  client,
  scope,
  picker,
}: {
  client: HostClient;
  scope: ModelScope;
  picker?: ModelField | undefined;
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
  const openPicker = (field: ModelField) => {
    if (scope.kind === 'bot')
      router.push({ pathname: '/bot/[slug]/model-picker', params: { slug: scope.slug, field } });
    else
      router.push({
        pathname: '/settings/model-picker',
        params: { field, ...(scope.kind === 'preset' ? { id: scope.id } : {}) },
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
    const choose = (route: ModelRoute) => {
      models.run(
        () =>
          setModelRoute(client, scope, value, assignment ? 'assignment' : 'orchestrator', route),
        () => {
          Keyboard.dismiss();
          router.back();
        },
      );
    };
    if (picker.endsWith('-effort')) {
      const efforts = [
        { id: '', name: t.modelSettings.providerDefault },
        ...(currentEntry?.efforts ?? []).filter((entry) => entry.id !== ''),
      ];
      return frame(
        <FlatList
          data={efforts}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={banner ?? undefined}
          renderItem={({ item, index }) => (
            <SettingsGroupItem
              first={index === 0}
              last={index === efforts.length - 1}
              on={SHEET_GROUP}
            >
              <SettingsRow
                on={SHEET_GROUP}
                title={item.name}
                selected={(current?.reasoningEffort ?? '') === item.id}
                control={
                  (current?.reasoningEffort ?? '') === item.id ? { kind: 'check' } : undefined
                }
                onPress={
                  models.busy || current === undefined
                    ? undefined
                    : () =>
                        choose({
                          provider: current.provider,
                          model: current.model,
                          ...(item.id === '' ? {} : { reasoningEffort: item.id }),
                        })
                }
              />
            </SettingsGroupItem>
          )}
        />,
      );
    }
    const families = modelFamilies(
      value.models.map((entry) => ({
        provider: entry.provider,
        model: entry.model,
        name: entry.modelName,
      })),
    );
    const groups = picker === 'orchestrator' || scope.kind !== 'global' ? (value.groups ?? []) : [];
    const listedGroups = routes.groups.assignmentGroups ?? [];
    const currentGroupId =
      picker === 'orchestrator'
        ? scope.kind === 'global'
          ? value.defaultGroupId
          : routes.groups.orchestratorGroupId
        : picker === 'assignment'
          ? routes.groups.assignmentDefaultGroupId
          : undefined;
    const currentGroup = groups.find((group) => group.id === currentGroupId);
    const starredKeys = new Set(models.favorites.map(modelChoiceKey));
    const rowKey = (row: PickerRow) =>
      row.kind === 'group'
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
    const favoriteCount =
      value.models.filter(starredModel).length + groupRows.filter(starredRow).length;
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
      (filter === GROUPS && groups.length > 0)
        ? filter
        : filter === FAVORITES
          ? FAVORITES
          : ALL;
    const needle = query.trim().toLowerCase();
    const found: PickerRow[] = [
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
          (shownFamily === GROUPS
            ? row.kind === 'group'
            : row.kind === 'model' && modelFamilyKey(row.entry) === shownFamily),
    );
    const entries =
      shownFamily === FAVORITES
        ? found
        : [...found.filter(listedRow), ...found.filter((row) => !listedRow(row))];
    const star = (row: PickerRow, on: boolean) => {
      if (family === undefined) setFamily(shownFamily);
      setHeld(
        (current) =>
          current ??
          new Set(
            [...groupRows, ...value.models.map((entry): PickerRow => ({ kind: 'model', entry }))]
              .filter(starredRow)
              .map(rowKey),
          ),
      );
      models.favorite(
        row.kind === 'group'
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
        {families.length > 1 || showFavorites || groups.length > 0 ? (
          <ScrollView
            horizontal
            testID="model-family-filters"
            accessibilityLabel={t.modelSettings.families}
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0 }}
            contentContainerStyle={{
              gap: space.x2,
              paddingHorizontal: space.x5,
              paddingVertical: space.x2,
            }}
          >
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
          </ScrollView>
        ) : null}
        {banner}
        {restNotice === undefined ? null : <SheetCallout tone="warning">{restNotice}</SheetCallout>}
        {models.busy ? <LoadingIndicator /> : null}
        <FlatList
          style={{ flex: 1 }}
          data={entries}
          keyExtractor={rowKey}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            picker === 'allowed' ? <SheetNote>{t.modelSettings.allowedHint}</SheetNote> : undefined
          }
          ListEmptyComponent={<SheetNote>{t.modelSettings.noResults}</SheetNote>}
          renderItem={({ item: row, index }) => {
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
                <SettingsGroupItem
                  first={index === 0}
                  last={index === entries.length - 1}
                  on={SHEET_GROUP}
                >
                  <SettingsRow
                    on={SHEET_GROUP}
                    testID={`model-group-${group.id}`}
                    {...(front === undefined || group.restingUntil !== undefined
                      ? {}
                      : {
                          accessibilityLabel: `${group.name}, ${t.modelSettings.groupFront(
                            `${front.modelName} · ${front.providerName}`,
                          )}`,
                        })}
                    leading={
                      front === undefined || group.restingUntil !== undefined ? (
                        <RowIcon
                          name="model"
                          size={theme.type.title.line}
                          color={usable ? theme.color.fg : theme.color.muted}
                        />
                      ) : (
                        <ModelBrandIcon
                          brand={modelEntryLabel(front).brand}
                          size={theme.type.title.line}
                          color={usable ? theme.color.fg : theme.color.muted}
                        />
                      )
                    }
                    title={group.name}
                    detail={[
                      ...(picker === 'orchestrator'
                        ? []
                        : [t.modelSettings.count(group.routes.length)]),
                      group.restingUntil !== undefined
                        ? restingLabel(group.restingUntil)
                        : t.modelSettings.groupFront(
                            front === undefined
                              ? (group.routes[0]?.model ?? '')
                              : `${/\p{L}/u.test(modelEntryLabel(front).short) ? modelEntryLabel(front).short : front.modelName} · ${front.providerName}`,
                          ),
                      ...(picker === 'allowed' && note !== undefined ? [note] : []),
                    ].join(' · ')}
                    tone={usable ? 'fg' : 'muted'}
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
                                    models.run(
                                      () =>
                                        setModelGroup(
                                          client,
                                          scope,
                                          value,
                                          group.id,
                                          picker === 'assignment' ? 'assignment' : 'orchestrator',
                                        ),
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
            const item = row.entry;
            const selected =
              picker === 'allowed'
                ? routes.assignmentModels.some((option) => sameModel(option, item))
                : currentGroup === undefined && sameModel(item, current);
            const usable = item.credential === undefined && item.restingUntil === undefined;
            const required = picker === 'allowed' && sameModel(item, routes.assignmentDefault);
            const isFavorite = starredRow(row);
            return (
              <SettingsGroupItem
                first={index === 0}
                last={index === entries.length - 1}
                on={SHEET_GROUP}
              >
                <SettingsRow
                  on={SHEET_GROUP}
                  leading={
                    <ModelBrandIcon
                      brand={modelEntryLabel(item).brand}
                      size={theme.type.title.line}
                      color={usable ? theme.color.fg : theme.color.muted}
                    />
                  }
                  title={modelEntryLabel(item).name}
                  accessibilityLabel={`${item.modelName}, ${item.providerName}`}
                  detail={
                    item.credential === 'missing'
                      ? t.modelNeedsKey(item.providerName)
                      : item.credential === 'invalid'
                        ? t.modelKeyInvalid(item.providerName)
                        : item.restingUntil !== undefined
                          ? `${item.providerName} · ${restingLabel(item.restingUntil)}`
                          : item.providerName
                  }
                  tone={usable ? 'fg' : 'muted'}
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
                                const reasoningEffort = sameModel(item, current)
                                  ? current?.reasoningEffort
                                  : item.defaultEffort;
                                choose({
                                  provider: item.provider,
                                  model: item.model,
                                  ...(reasoningEffort === undefined || reasoningEffort === ''
                                    ? {}
                                    : { reasoningEffort }),
                                });
                              }
                            }
                  }
                />
              </SettingsGroupItem>
            );
          }}
        />
      </>,
    );
  }

  const showPreset = scope.kind === 'preset';
  const presets = showPreset ? [] : value.presets;
  const groupName = (id: string | undefined) =>
    id === undefined ? undefined : (value.groups?.find((group) => group.id === id)?.name ?? id);
  const orchestratorGroup =
    scope.kind === 'preset'
      ? groupName(routes.groups.orchestratorGroupId)
      : currentModel(value).group;
  const assignmentGroup = groupName(routes.groups.assignmentDefaultGroupId);
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
          <PickerLink
            label={scope.kind === 'global' ? t.modelSettings.global : t.modelSettings.orchestrator}
            detail={
              orchestratorGroup !== undefined
                ? `${orchestratorGroup} · ${routeLabel(value, routes.orchestrator)}`
                : routeLabel(value, routes.orchestrator)
            }
            onPress={models.busy ? undefined : () => openPicker('orchestrator')}
          />
          {orchestratorGroup === undefined &&
          value.models.find((entry) => sameModel(entry, routes.orchestrator))?.efforts?.length ? (
            <PickerLink
              label={t.modelSettings.effort}
              detail={routes.orchestrator?.reasoningEffort ?? t.modelSettings.providerDefault}
              onPress={models.busy ? undefined : () => openPicker('orchestrator-effort')}
            />
          ) : null}
          {scope.kind === 'global' ? null : (
            <>
              <PickerLink
                label={t.modelSettings.assignment}
                detail={
                  assignmentGroup !== undefined
                    ? `${assignmentGroup} · ${routeLabel(value, routes.assignmentDefault)}`
                    : routeLabel(value, routes.assignmentDefault)
                }
                onPress={models.busy ? undefined : () => openPicker('assignment')}
              />
              {assignmentGroup === undefined &&
              value.models.find((entry) => sameModel(entry, routes.assignmentDefault))?.efforts
                ?.length ? (
                <PickerLink
                  label={t.modelSettings.effort}
                  detail={
                    routes.assignmentDefault?.reasoningEffort ?? t.modelSettings.providerDefault
                  }
                  onPress={models.busy ? undefined : () => openPicker('assignment-effort')}
                />
              ) : null}
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
      data={presets}
      renderScrollComponent={renderKeyboardFormScroll}
      keyExtractor={(preset) => preset.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListHeaderComponent={form}
      contentContainerStyle={{ paddingVertical: space.x3 }}
      renderItem={({ item, index }) => (
        <SettingsGroupItem first={index === 0} last={index === presets.length - 1} on={SHEET_GROUP}>
          <SettingsRow
            on={SHEET_GROUP}
            title={item.name}
            detail={`${groupName(item.orchestratorGroupId) ?? routeLabel(value, item.orchestrator)}${item.assignmentDefault === undefined ? '' : ` / ${groupName(item.assignmentDefaultGroupId) ?? routeLabel(value, item.assignmentDefault)}`}`}
            disclosure={scope.kind === 'global'}
            selected={scope.kind === 'bot' && value.plan?.sourcePresetId === item.id}
            onPress={
              models.busy
                ? undefined
                : () => {
                    if (scope.kind === 'global')
                      router.push({ pathname: '/settings/model-preset', params: { id: item.id } });
                    else if (scope.kind === 'bot')
                      models.run(async () => {
                        await applyModelPreset(client, scope.slug, item.id);
                      });
                  }
            }
          />
        </SettingsGroupItem>
      )}
    />,
  );
}

export function ModelSettingsScreen({
  kind,
  pick = false,
}: {
  kind: ModelScope['kind'];
  pick?: boolean;
}) {
  const t = useStrings();
  const {
    slug = '',
    id = '',
    field = 'orchestrator',
  } = useLocalSearchParams<{ slug: string; id: string; field: string }>();
  const { client, saved } = useHostSession();
  const scope: ModelScope =
    kind === 'bot'
      ? { kind, slug }
      : kind === 'preset' || (pick && id !== '')
        ? { kind: 'preset', id }
        : { kind: 'global' };
  const picker: ModelField | undefined = pick
    ? ['assignment', 'allowed', 'orchestrator-effort', 'assignment-effort'].includes(field)
      ? (field as ModelField)
      : 'orchestrator'
    : undefined;
  if (client === undefined) return <SheetNote>{t.unreachable}</SheetNote>;
  return (
    <ModelsView
      key={`${saved?.hostId}:${modelScopeKey(scope)}:${picker ?? ''}`}
      client={client}
      scope={scope}
      picker={picker}
    />
  );
}
