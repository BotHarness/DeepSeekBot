import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Keyboard, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { applyModelPreset, errorText, sameModel, type ModelRoute } from '../../host/bot-settings';
import type { HostClient } from '../../host/client';
import { useHostSession } from '../../host/host-session';
import {
  inheritModel,
  modelRoutes,
  modelScopeKey,
  modelSettingsResource,
  saveModelPreset,
  searchModels,
  setModelRoute,
  toggleAssignmentModel,
  type ModelField,
  type ModelScope,
  type ModelSettingsState,
} from '../../host/model-settings';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { renderKeyboardFormScroll } from '../primitives/keyboard-form';
import { SearchField } from '../primitives/search-field';
import { SettingsGroupItem, SettingsRow, SettingsSection } from '../primitives/settings-row';
import { SheetPage } from '../primitives/sheet-page';
import { TextField } from '../primitives/text-field';
import { CheckIcon } from '../shell/icons';
import { t } from '../strings';
import { SHEET_GROUP, SheetCallout, SheetFailed, SheetLoading, SheetNote } from './sheet';

function useModels(client: HostClient, scope: ModelScope) {
  const key = modelScopeKey(scope);
  const resource = useMemo(() => modelSettingsResource(client, scope), [client, key]);
  const [value, setValue] = useState(resource.peek);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
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
  return { value, error, busy, refresh, run };
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
  const router = useRouter();
  const theme = useDesignTheme();
  const models = useModels(client, scope);
  const [query, setQuery] = useState('');
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
            ? t.modelSettings.orchestrator
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
                trailing={
                  (current?.reasoningEffort ?? '') === item.id ? (
                    <CheckIcon color={theme.color.fg} size={theme.type.title.line} />
                  ) : undefined
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
    const entries = searchModels(value.models, query);
    return frame(
      <>
        <SearchField
          value={query}
          inset={space.x5}
          placeholder={t.modelSettings.search}
          onChangeText={setQuery}
        />
        {banner}
        {models.busy ? <ActivityIndicator /> : null}
        <FlatList
          style={{ flex: 1 }}
          data={entries}
          keyExtractor={(item) => JSON.stringify([item.provider, item.model])}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            picker === 'allowed' ? <SheetNote>{t.modelSettings.allowedHint}</SheetNote> : undefined
          }
          ListEmptyComponent={<SheetNote>{t.modelSettings.noResults}</SheetNote>}
          renderItem={({ item, index }) => {
            const selected =
              picker === 'allowed'
                ? routes.assignmentModels.some((option) => sameModel(option, item))
                : sameModel(item, current);
            const usable = item.credential === undefined;
            const required = picker === 'allowed' && sameModel(item, routes.assignmentDefault);
            return (
              <SettingsGroupItem
                first={index === 0}
                last={index === entries.length - 1}
                on={SHEET_GROUP}
              >
                <SettingsRow
                  on={SHEET_GROUP}
                  title={item.modelName}
                  detail={
                    item.credential === 'missing'
                      ? t.modelNeedsKey(item.providerName)
                      : item.credential === 'invalid'
                        ? t.modelKeyInvalid(item.providerName)
                        : item.providerName
                  }
                  tone={usable ? 'fg' : 'muted'}
                  selected={selected}
                  trailing={
                    selected ? (
                      <CheckIcon color={theme.color.fg} size={theme.type.title.line} />
                    ) : undefined
                  }
                  onPress={
                    models.busy || (!usable && !(picker === 'allowed' && selected)) || required
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
      {models.busy ? <ActivityIndicator /> : null}
      <View style={{ paddingHorizontal: space.x5 }}>
        <SettingsSection
          title={scope.kind === 'global' ? t.modelSettings.global : t.modelSettings.title}
          on={SHEET_GROUP}
        >
          <PickerLink
            label={scope.kind === 'global' ? t.modelSettings.global : t.modelSettings.orchestrator}
            detail={routeLabel(value, routes.orchestrator)}
            onPress={models.busy ? undefined : () => openPicker('orchestrator')}
          />
          {value.models.find((entry) => sameModel(entry, routes.orchestrator))?.efforts?.length ? (
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
                detail={routeLabel(value, routes.assignmentDefault)}
                onPress={models.busy ? undefined : () => openPicker('assignment')}
              />
              {value.models.find((entry) => sameModel(entry, routes.assignmentDefault))?.efforts
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
                    : t.modelSettings.count(routes.assignmentModels.length)
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
            detail={`${routeLabel(value, item.orchestrator)}${item.assignmentDefault === undefined ? '' : ` / ${routeLabel(value, item.assignmentDefault)}`}`}
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
