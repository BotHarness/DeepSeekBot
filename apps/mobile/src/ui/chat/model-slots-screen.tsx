import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { HostClient } from '@botharness/host-client/client';
import {
  applyModelPreset,
  DEFAULT_MODEL_PRESET_ID,
  loadModelPlanState,
  loadModelPresetLibrary,
  resetModelSlots,
  setBotEngine,
  type ModelSlot,
} from '@botharness/host-client/model-plans';
import {
  modelSub,
  saveModelPreset,
  setModelEngine,
  setModelGroup,
  setModelRoute,
  setModelSub,
  type ModelScope,
} from '@botharness/host-client/model-settings';
import { addSubChoice, type SubChoice } from '@botharness/host-client/preset-sub';
import type { SessionModelChoice } from '@botharness/host-protocol/session-model';

import { sessionModelQueries } from '../../host/session-model-query';
import { useHostSession } from '../../host/host-session';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { SheetPage } from '../primitives/sheet-page';
import { TextField } from '../primitives/text-field';
import { useStrings } from '../strings';
import { ModelBrandIcon } from './model-brand-icon';
import { useSlotPicker } from './model-slot-picker';
import {
  linkedPreset,
  mainChoice,
  ownSlots,
  presetMainChoice,
  sessionChoiceOfSub,
  slotEffortOptions,
  subChoiceOf,
} from './model-slots';
import { useModels } from './model-settings-screen';
import { sessionDefaultModel, sessionModelKey } from './session-model-label';
import { SHEET_GROUP, SheetCallout, SheetFailed, SheetLoading, SheetNote } from './sheet';
import { subChoiceKey } from './sub-choice-text';
import { SubChoiceSection } from './sub-choice-section';
import { useEngineOptions } from './sub-choice-engines';

type SlotScope = Extract<ModelScope, { kind: 'bot' | 'preset' }>;

export function ModelSlotsView({ client, scope }: { client: HostClient; scope: SlotScope }) {
  const t = useStrings();
  const copy = t.modelSlots;
  const theme = useDesignTheme();
  const router = useRouter();
  const { saved } = useHostSession();
  const hostId = saved?.hostId;
  const models = useModels(client, scope);
  const engines = useEngineOptions(client);
  const picker = useSlotPicker(client, hostId);
  const [name, setName] = useState<string>();
  const [savedName, setSavedName] = useState(false);
  const usage = useQuery(
    {
      queryKey: ['model-preset-usage', hostId ?? ''],
      queryFn: () => loadModelPresetLibrary(client),
      enabled: scope.kind === 'preset',
      staleTime: 0,
    },
    sessionModelQueries,
  );
  const value = models.value;
  const preset =
    value === undefined ? undefined : scope.kind === 'preset' ? value.preset : linkedPreset(value);
  const title =
    scope.kind === 'preset'
      ? value?.preset?.id === DEFAULT_MODEL_PRESET_ID
        ? t.modelConfig.sectionDefault
        : (value?.preset?.name ?? t.modelPresets)
      : t.modelSettings.title;
  const page = (body: React.ReactNode) => <SheetPage title={title}>{body}</SheetPage>;
  if (value === undefined)
    return page(
      models.error === undefined ? (
        <SheetLoading />
      ) : (
        <SheetFailed message={t.modelFailed} onRetry={models.refresh} />
      ),
    );
  const own = scope.kind === 'bot' ? ownSlots(value) : [];
  const presetName = preset?.name ?? t.modelConfig.sectionDefault;
  const catalog = { models: value.models, groups: value.groups, engines: value.engines ?? engines };
  const main = mainChoice(value, scope);
  const mainLabel = main === undefined ? {} : sessionDefaultModel(main, catalog);
  const mainEffort =
    main?.effort === undefined
      ? undefined
      : slotEffortOptions(catalog, main, t.modelSettings.providerDefault).find(
          (option) => option.id === main.effort,
        )?.label;
  const mainGroup =
    main?.kind === 'group' ? value.groups?.find((group) => group.id === main.id) : undefined;
  const mainDetail =
    mainGroup !== undefined
      ? [
          t.routingGroup.group,
          mainGroup.routes
            .map(
              (route) =>
                value.models.find(
                  (entry) => entry.provider === route.provider && entry.model === route.model,
                )?.modelName ?? route.model,
            )
            .join(' → '),
        ].join(' · ')
      : [
          main?.kind === 'model'
            ? value.models.find(
                (entry) => entry.provider === main.provider && entry.model === main.model,
              )?.providerName
            : main?.kind === 'engine'
              ? t.sessionModel.sub
              : undefined,
          mainEffort,
        ]
          .filter(Boolean)
          .join(' · ');
  const reset = (slots: readonly ModelSlot[]) =>
    models.write(async () => {
      if (scope.kind !== 'bot') return;
      await resetModelSlots(client, scope.slug, slots, value.plan?.revision ?? value.revision);
    });
  const pickMain = async (choice: SessionModelChoice | null) => {
    if (choice === null) {
      await reset(['main']);
      return;
    }
    await models.write(async () => {
      if (choice.kind === 'engine') {
        await setModelEngine(client, scope, value, {
          engine: choice.engine,
          model: choice.model,
          ...(choice.accountId === undefined ? {} : { accountId: choice.accountId }),
          ...(choice.effort === undefined ? {} : { effort: choice.effort }),
        });
        return;
      }
      if (choice.kind === 'group')
        await setModelGroup(client, scope, value, choice.id, choice.effort);
      else
        await setModelRoute(client, scope, value, {
          provider: choice.provider,
          model: choice.model,
          ...(choice.effort === undefined ? {} : { reasoningEffort: choice.effort }),
        });
      if (scope.kind === 'bot' && main?.kind === 'engine' && own.includes('main'))
        await setBotEngine(client, scope.slug, 'orchestrator', null);
    });
  };
  const sub = modelSub(value);
  const taken = sub.choices
    .map(sessionChoiceOfSub)
    .filter((choice) => choice !== undefined)
    .map((choice) => sessionModelKey(choice));
  const addSubs = (choices: SessionModelChoice[]) =>
    models.write(async () => {
      const next = choices
        .map((choice) => subChoiceOf(value, choice))
        .filter((choice): choice is SubChoice => choice !== undefined)
        .reduce(addSubChoice, sub);
      await setModelSub(client, scope, value, next);
    });
  const openChoice = (choice: SubChoice) => {
    const key = subChoiceKey(choice);
    if (scope.kind === 'bot')
      router.push({ pathname: '/bot/[slug]/model-sub-choice', params: { slug: scope.slug, key } });
    else router.push({ pathname: '/settings/model-sub-choice', params: { id: scope.id, key } });
  };
  const switchPreset = (id: string) =>
    models.write(async () => {
      if (scope.kind !== 'bot') return;
      const keep = own.includes('sub');
      await applyModelPreset(client, scope.slug, id, { keepOverrides: keep });
      if (keep && own.includes('main')) {
        const fresh = await loadModelPlanState(client, scope.slug);
        await resetModelSlots(client, scope.slug, ['main'], fresh.revision ?? 0);
      }
    });
  const openMain = () =>
    picker.open({
      kind: 'main',
      title: t.modelSettings.orchestrator,
      current: own.includes('main') || scope.kind === 'preset' ? (main ?? null) : null,
      ...(scope.kind === 'bot'
        ? {
            presets: {
              title: copy.preset,
              current: preset?.id,
              rows: value.presets.map((entry) => {
                const label = sessionDefaultModel(presetMainChoice(entry), catalog);
                return {
                  id: entry.id,
                  name: entry.name,
                  brand: label.brand,
                  detail: copy.presetMain(
                    label.detail ?? entry.orchestrator.model,
                    copy.presetSubs(entry.sub?.choices.length ?? 0),
                  ),
                  ...(entry.id === DEFAULT_MODEL_PRESET_ID ? { tag: copy.defaultTag } : {}),
                };
              }),
              onPick: switchPreset,
            },
          }
        : {}),
      onPick: pickMain,
    });
  const users =
    scope.kind === 'preset'
      ? usage.data?.usage.find((entry) => entry.presetId === scope.id)
      : undefined;
  const form = (
    <View style={{ gap: space.x4 }}>
      {scope.kind === 'preset' ? <SheetNote>{t.modelSettings.presetHint}</SheetNote> : null}
      {models.error === undefined ? null : (
        <SheetCallout tone="danger">{`${t.settingFailed} ${models.error}`}</SheetCallout>
      )}
      {models.busy ? <LoadingIndicator /> : null}
      {scope.kind === 'bot' ? (
        <View style={{ paddingHorizontal: space.x5 }}>
          <SettingsSection
            title={copy.preset}
            on={SHEET_GROUP}
            {...(own.length > 0 ? { footer: copy.ownBanner(own.length) } : {})}
          >
            <SettingsRow
              on={SHEET_GROUP}
              testID="model-slots-preset"
              title={presetName}
              detail={own.length === 0 ? copy.follows : copy.changed(own.length)}
              control={{ kind: 'value', text: copy.change, chevron: true }}
              onPress={openMain}
            />
            {own.length === 0 ? null : (
              <SettingsRow
                on={SHEET_GROUP}
                testID="model-slots-restore-all"
                title={copy.restoreAll}
                tone="accent"
                onPress={() => void reset(['main', 'sub']).catch(() => undefined)}
              />
            )}
          </SettingsSection>
        </View>
      ) : null}
      <View style={{ paddingHorizontal: space.x5 }}>
        <SettingsSection
          title={
            own.includes('main')
              ? `${t.modelSettings.orchestrator} · ${copy.own}`
              : t.modelSettings.orchestrator
          }
          footer={copy.mainHint}
          on={SHEET_GROUP}
        >
          <SettingsRow
            on={SHEET_GROUP}
            testID="model-slots-main"
            title={mainLabel.detail ?? t.noModel}
            detail={mainDetail}
            leading={
              <ModelBrandIcon
                brand={mainLabel.brand}
                size={theme.type.title.line * theme.fontScale}
                color={theme.color.fg}
              />
            }
            control={{ kind: 'chevron' }}
            onPress={openMain}
          />
          {own.includes('main') ? (
            <SettingsRow
              on={SHEET_GROUP}
              testID="model-slots-restore-main"
              title={copy.restoreMain(presetName)}
              tone="accent"
              onPress={() => void reset(['main']).catch(() => undefined)}
            />
          ) : null}
        </SettingsSection>
      </View>
      <View style={{ paddingHorizontal: space.x5 }}>
        <SubChoiceSection
          value={value}
          engines={engines}
          busy={models.busy}
          onOpen={openChoice}
          own={own.includes('sub')}
          {...(own.includes('sub')
            ? {
                restore: {
                  label: copy.restoreSub(presetName),
                  onPress: () => void reset(['sub']).catch(() => undefined),
                },
              }
            : {})}
          onAdd={() =>
            picker.open({
              kind: 'add',
              title: t.subChoices.add,
              taken,
              groups: true,
              onAdd: addSubs,
            })
          }
        />
      </View>
      {scope.kind === 'preset' ? (
        <View style={{ paddingHorizontal: space.x5 }}>
          <SettingsSection title={copy.usedBy} footer={copy.usedByHint} on={SHEET_GROUP}>
            {users === undefined || users.botNames.length === 0 ? (
              <SettingsRow on={SHEET_GROUP} title={copy.usedByNone} tone="muted" />
            ) : (
              users.botNames.map((bot) => <SettingsRow key={bot} on={SHEET_GROUP} title={bot} />)
            )}
          </SettingsSection>
        </View>
      ) : null}
      <View style={{ paddingHorizontal: space.x5, gap: space.x3 }}>
        <TextField
          value={name ?? value.preset?.name ?? ''}
          onChangeText={(next) => {
            setName(next);
            setSavedName(false);
          }}
          accessibilityLabel={t.modelSettings.name}
          placeholder={t.modelSettings.name}
        />
        <Button
          label={scope.kind === 'preset' ? t.modelSettings.rename : t.modelSettings.create}
          busy={models.busy}
          disabled={(name ?? value.preset?.name ?? '').trim() === ''}
          onPress={() =>
            models.run(async () => {
              await saveModelPreset(
                client,
                value,
                name ?? value.preset?.name ?? '',
                scope.kind === 'preset',
              );
              setSavedName(true);
              if (scope.kind !== 'preset') setName('');
            })
          }
        />
        {savedName ? <SheetNote>{t.modelSettings.saved}</SheetNote> : null}
      </View>
    </View>
  );
  return (
    <>
      {page(
        <KeyboardFormScroll
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: space.x3 }}
        >
          {form}
        </KeyboardFormScroll>,
      )}
      {picker.sheet}
    </>
  );
}
