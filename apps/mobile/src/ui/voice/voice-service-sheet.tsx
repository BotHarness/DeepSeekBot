import { useRef, useState } from 'react';
import { Keyboard, View } from 'react-native';

import { errorText } from '@botharness/host-client/bot-settings';
import { providerBrand } from '@botharness/host-client/shared/model-brand';
import {
  CUSTOM_CHOICE,
  choiceValues,
  chosenValue,
  defaultProviderName,
  initialChoice,
  type Choice,
} from '@botharness/host-client/shared/voice-options';
import {
  checkTemplate,
  type TemplateDraft,
  type TemplateErrors,
} from '@botharness/host-client/shared/voice-template-draft';
import {
  BLANK_EXAMPLE,
  exampleStart,
  examplesFor,
} from '@botharness/host-client/shared/voice-template-examples';
import type { VoiceTemplateValidation } from '@botharness/host-protocol/voice-request-template';
import {
  presetsOf,
  voiceAccessDenied,
  type VoiceKind,
  type VoicePresetView,
  type VoiceServiceAdd,
  type VoiceServicesView,
  type VoiceServiceView,
} from '@botharness/host-client/voice-providers';
import type {
  VoiceCatalogImportInput,
  VoiceCatalogInput,
  VoiceCatalogItem,
  VoiceCatalogPage,
} from '@botharness/host-protocol/voice-catalog';

import { ModelBrandIcon } from '../chat/model-brand-icon';
import { SHEET_GROUP, Sheet, SheetActions, SheetCallout } from '../chat/sheet';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { CreationField } from '../primitives/creation-field';
import { DrawerHeader } from '../primitives/drawer-header';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { PreferenceRow } from '../primitives/preference-row';
import { SettingsGroupItem, SettingsRow } from '../primitives/settings-row';
import { useStrings } from '../strings';
import { VoiceCatalogList, type VoiceCatalogSource } from './voice-catalog-list';
import { useTemplateMessages, VoiceTemplateFields } from './voice-template-fields';

export interface VoiceServiceSheetPort {
  add(input: VoiceServiceAdd): Promise<VoiceServiceView>;
  browse(input: VoiceCatalogInput): Promise<VoiceCatalogPage>;
  importVoice(input: VoiceCatalogImportInput): Promise<VoiceCatalogItem>;
  validate(kind: VoiceKind, template: unknown): Promise<VoiceTemplateValidation>;
}

export const TEMPLATE_PRESET = '\u0000template';

interface Draft {
  readonly preset: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly key: string;
  readonly model: Choice;
  readonly voice: Choice;
  readonly template?: TemplateDraft;
  readonly example?: string;
}

type Page = 'form' | 'preset' | 'model' | 'voice';

function emptyDraft(preset: VoicePresetView | undefined): Draft {
  return {
    preset: preset?.id ?? 'custom',
    name: '',
    baseUrl: '',
    key: '',
    model: initialChoice(preset?.models ?? [], preset?.defaultModel),
    voice: initialChoice(
      (preset?.voices ?? []).map((voice) => voice.id),
      preset?.defaultVoice,
    ),
  };
}

function templateDraft(kind: VoiceKind, example: string, keep?: Draft): Draft {
  const start = exampleStart(kind, example);
  return {
    preset: TEMPLATE_PRESET,
    name: keep?.name ?? '',
    baseUrl: '',
    key: keep?.key ?? '',
    model: { choice: CUSTOM_CHOICE, custom: start.model },
    voice: { choice: CUSTOM_CHOICE, custom: start.voice },
    template: start.template,
    example: start.example,
  };
}

function choiceLabel(
  state: Choice,
  names: Readonly<Record<string, string>>,
  custom: string,
): string {
  if (state.catalogName !== undefined) return state.catalogName;
  if (state.choice === CUSTOM_CHOICE) return state.custom.trim() === '' ? custom : state.custom;
  return names[state.choice] ?? state.choice;
}

export function VoiceServiceSheet({
  kind,
  view,
  port,
  onClose,
  onAdded,
}: {
  kind: VoiceKind;
  view: VoiceServicesView;
  port: VoiceServiceSheetPort;
  onClose(): void;
  onAdded(service: VoiceServiceView): void;
}) {
  const t = useStrings().voiceSettings;
  const theme = useDesignTheme();
  const presets = presetsOf(view, kind);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(presets[0]));
  const [page, setPage] = useState<Page>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [templateErrors, setTemplateErrors] = useState<TemplateErrors>({});
  const pending = useRef(false);
  const messages = useTemplateMessages();
  const custom = draft.template;
  const preset = presets.find((entry) => entry.id === draft.preset);
  const presetName = custom === undefined ? (preset?.name ?? draft.preset) : t.template.service;
  const brand = providerBrand(custom === undefined ? draft.preset : 'custom', preset?.name);
  const needsUrl = custom === undefined && preset?.baseUrl === undefined;
  const needsKey = preset?.keyRequired === true;
  const models = choiceValues(preset?.models ?? [], preset?.defaultModel);
  const voices = choiceValues(
    (preset?.voices ?? []).map((voice) => voice.id),
    preset?.defaultVoice,
  );
  const voiceNames = Object.fromEntries(
    (preset?.voices ?? []).map((voice) => [voice.id, voice.name]),
  );
  const suggested = defaultProviderName(presetName, [...view.providers, ...view.asrProviders]);
  const catalogFor = (collection: 'models' | 'account'): VoiceCatalogSource | undefined =>
    preset?.catalogs?.includes(collection) === true
      ? {
          preset: draft.preset,
          kind,
          key: draft.key,
          collection,
          collections: preset.catalogs,
          browse: port.browse,
          importVoice: port.importVoice,
        }
      : undefined;
  const modelCatalog = catalogFor('models');
  const voiceCatalog = kind === 'tts' ? catalogFor('account') : undefined;
  const close = () => {
    if (pending.current) return;
    Keyboard.dismiss();
    onClose();
  };
  const fail = (cause: unknown) => {
    pending.current = false;
    setBusy(false);
    setError(voiceAccessDenied(cause) ? t.ownerOnly : errorText(cause));
  };
  const submit = () => {
    if (pending.current) return;
    const model = chosenValue(draft.model);
    const voice = kind === 'tts' ? chosenValue(draft.voice) : undefined;
    const fields: VoiceServiceAdd = {
      kind,
      preset: draft.preset,
      ...(draft.name.trim()
        ? { name: draft.name.trim() }
        : custom === undefined
          ? {}
          : { name: suggested }),
      ...(model === undefined ? {} : { model }),
      ...(voice === undefined ? {} : { defaultVoice: voice }),
      ...(draft.key.trim() ? { key: draft.key.trim() } : {}),
    };
    pending.current = true;
    setBusy(true);
    setError(undefined);
    Keyboard.dismiss();
    const request: Promise<VoiceServiceView | undefined> =
      custom === undefined
        ? port.add({
            ...fields,
            ...(draft.baseUrl.trim() ? { baseUrl: draft.baseUrl.trim() } : {}),
          })
        : checkTemplate(port.validate, kind, custom, messages).then((checked) => {
            setTemplateErrors(checked.ok ? {} : checked.errors);
            if (checked.ok)
              return port.add({ ...fields, preset: 'custom', template: checked.template });
            setError(checked.errors.form);
            return undefined;
          });
    request.then((service) => {
      pending.current = false;
      setBusy(false);
      if (service !== undefined) onAdded(service);
    }, fail);
  };
  const keyField = (
    <CreationField
      testID="voice-service-key"
      accessibilityLabel={needsKey ? t.key : t.keyOptional}
      supportingText={custom === undefined ? t.keyHint : t.template.keyHint}
      value={draft.key}
      secureTextEntry
      autoCapitalize="none"
      autoCorrect={false}
      onChangeText={(key) =>
        setDraft((current) => {
          const defaults = emptyDraft(preset);
          return {
            ...current,
            key,
            model: current.model.catalogName === undefined ? current.model : defaults.model,
            voice: current.voice.catalogName === undefined ? current.voice : defaults.voice,
          };
        })
      }
    />
  );
  const title = kind === 'tts' ? t.addTts : t.addAsr;
  const choose = (field: 'model' | 'voice') => (item: VoiceCatalogItem, fromCatalog: boolean) => {
    setDraft((current) => ({
      ...current,
      [field]: {
        choice: item.id,
        custom: current[field].custom,
        ...(fromCatalog ? { catalogName: item.name } : {}),
      },
    }));
    setPage('form');
  };
  const listOptions = (values: readonly string[], names: Readonly<Record<string, string>>) => [
    ...values.map((id) => ({ id, name: names[id] ?? id, brand })),
    { id: CUSTOM_CHOICE, name: t.custom, brand: undefined },
  ];
  const pickerRow = (
    field: 'model' | 'voice',
    label: string,
    names: Readonly<Record<string, string>>,
    values: readonly string[],
    catalog: VoiceCatalogSource | undefined,
  ) => {
    const state = draft[field];
    const custom = (
      <View style={{ paddingHorizontal: space.x5 }}>
        <CreationField
          testID={`voice-service-${field}-custom`}
          accessibilityLabel={field === 'model' ? t.customModel : t.customVoice}
          value={state.custom}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(text) =>
            setDraft((current) => ({
              ...current,
              [field]: { choice: CUSTOM_CHOICE, custom: text },
            }))
          }
        />
      </View>
    );
    if (values.length === 0 && catalog === undefined) return custom;
    return (
      <>
        <View>
          <SettingsGroupItem first last on={SHEET_GROUP}>
            <SettingsRow
              on={SHEET_GROUP}
              testID={`voice-service-${field}`}
              leading={
                <ModelBrandIcon brand={brand} size={theme.type.title.line} color={theme.color.fg} />
              }
              title={choiceLabel(state, names, t.custom)}
              detail={label}
              accessibilityLabel={`${label}, ${choiceLabel(state, names, t.custom)}`}
              control={{ kind: 'chevron' }}
              onPress={() => {
                Keyboard.dismiss();
                setPage(field);
              }}
            />
          </SettingsGroupItem>
        </View>
        {state.choice === CUSTOM_CHOICE ? custom : null}
      </>
    );
  };
  return (
    <Sheet
      visible
      label={title}
      onClose={close}
      avoidKeyboard
      fill
      androidFill={page === 'model' || page === 'voice'}
    >
      {page === 'preset' ? (
        <View testID="voice-service-presets" style={{ flexShrink: 1 }}>
          <View style={{ paddingHorizontal: space.x5, paddingBottom: space.x4 }}>
            <DrawerHeader title={t.preset} onBack={() => setPage('form')} />
          </View>
          <KeyboardFormScroll enabled={false} nestedScrollEnabled>
            {presets.map((entry, index) => (
              <SettingsGroupItem key={entry.id} first={index === 0} last={false} on={SHEET_GROUP}>
                <SettingsRow
                  on={SHEET_GROUP}
                  testID={`voice-service-preset-${entry.id}`}
                  leading={
                    <ModelBrandIcon
                      brand={providerBrand(entry.id, entry.name)}
                      size={theme.type.title.line}
                      color={theme.color.fg}
                    />
                  }
                  title={entry.name}
                  selected={entry.id === draft.preset}
                  control={entry.id === draft.preset ? { kind: 'check' } : undefined}
                  onPress={() => {
                    if (entry.id !== draft.preset) {
                      setTemplateErrors({});
                      setDraft(emptyDraft(entry));
                    }
                    setPage('form');
                  }}
                />
              </SettingsGroupItem>
            ))}
            <SettingsGroupItem first={presets.length === 0} last on={SHEET_GROUP}>
              <SettingsRow
                on={SHEET_GROUP}
                testID="voice-service-preset-custom"
                leading={
                  <ModelBrandIcon
                    brand={providerBrand('custom')}
                    size={theme.type.title.line}
                    color={theme.color.fg}
                  />
                }
                title={t.template.service}
                selected={custom !== undefined}
                control={custom !== undefined ? { kind: 'check' } : undefined}
                onPress={() => {
                  if (custom === undefined) {
                    setTemplateErrors({});
                    setDraft(templateDraft(kind, BLANK_EXAMPLE));
                  }
                  setPage('form');
                }}
              />
            </SettingsGroupItem>
          </KeyboardFormScroll>
        </View>
      ) : page === 'model' ? (
        <VoiceCatalogList
          testID="voice-catalog-model"
          title={t.model}
          value={draft.model.choice}
          options={listOptions(models, {})}
          brand={brand}
          catalog={modelCatalog}
          onChoose={choose('model')}
          onBack={() => setPage('form')}
        />
      ) : page === 'voice' ? (
        <VoiceCatalogList
          testID="voice-catalog-voice"
          title={t.voice}
          value={draft.voice.choice}
          options={listOptions(voices, voiceNames)}
          brand={brand}
          catalog={voiceCatalog}
          onChoose={choose('voice')}
          onBack={() => setPage('form')}
        />
      ) : (
        <>
          <View style={{ paddingHorizontal: space.x5, paddingBottom: space.x4 }}>
            <DrawerHeader title={title} onClose={close} />
          </View>
          <KeyboardFormScroll nestedScrollEnabled>
            <View testID="voice-service-form" style={{ gap: space.x4 }}>
              <SettingsGroupItem first last on={SHEET_GROUP}>
                <SettingsRow
                  on={SHEET_GROUP}
                  testID="voice-service-preset"
                  leading={
                    <ModelBrandIcon
                      brand={brand}
                      size={theme.type.title.line}
                      color={theme.color.fg}
                    />
                  }
                  title={presetName}
                  detail={t.preset}
                  accessibilityLabel={`${t.preset}, ${presetName}`}
                  control={{ kind: 'chevron' }}
                  onPress={() => {
                    Keyboard.dismiss();
                    setPage('preset');
                  }}
                />
              </SettingsGroupItem>
              {custom === undefined ? null : (
                <SettingsGroupItem first last on={SHEET_GROUP}>
                  <PreferenceRow
                    on={SHEET_GROUP}
                    title={t.template.example}
                    testID="voice-template-example"
                    value={draft.example ?? BLANK_EXAMPLE}
                    options={[
                      { value: BLANK_EXAMPLE, label: t.template.blank, icon: 'preset' as const },
                      ...examplesFor(kind).map((entry) => ({
                        value: entry.id,
                        label: entry.name,
                        icon: 'preset' as const,
                      })),
                    ]}
                    onChange={(example) => {
                      setTemplateErrors({});
                      setDraft((current) => templateDraft(kind, example, current));
                    }}
                  />
                </SettingsGroupItem>
              )}
              <View style={{ paddingHorizontal: space.x5, gap: space.x4 }}>
                <CreationField
                  testID="voice-service-name"
                  accessibilityLabel={t.name}
                  value={draft.name}
                  placeholder={t.namePlaceholder(suggested)}
                  onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
                />
                {needsUrl ? (
                  <CreationField
                    testID="voice-service-url"
                    accessibilityLabel={t.baseUrl}
                    value={draft.baseUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    placeholder={
                      kind === 'tts' ? 'http://127.0.0.1:8880/v1' : 'http://127.0.0.1:8000/v1'
                    }
                    onChangeText={(baseUrl) => setDraft((current) => ({ ...current, baseUrl }))}
                  />
                ) : null}
                {custom === undefined ? keyField : null}
              </View>
              {custom === undefined ? null : (
                <VoiceTemplateFields
                  kind={kind}
                  draft={custom}
                  errors={templateErrors}
                  keyField={keyField}
                  onChange={(template) => setDraft((current) => ({ ...current, template }))}
                />
              )}
              {pickerRow('model', t.model, {}, models, modelCatalog)}
              {kind === 'tts'
                ? pickerRow('voice', t.voice, voiceNames, voices, voiceCatalog)
                : null}
            </View>
            {error === undefined ? null : (
              <View style={{ paddingTop: space.x4 }}>
                <SheetCallout tone="danger">{error}</SheetCallout>
              </View>
            )}
            <SheetActions>
              <Button
                testID="voice-service-submit"
                label={busy ? t.adding : custom === undefined ? t.submit : t.template.save}
                tone="primary"
                busy={busy}
                on={SHEET_GROUP}
                disabled={
                  (custom === undefined ? preset === undefined : custom.url.trim() === '') ||
                  (needsUrl && draft.baseUrl.trim() === '') ||
                  (needsKey && draft.key.trim() === '')
                }
                onPress={submit}
              />
            </SheetActions>
          </KeyboardFormScroll>
        </>
      )}
    </Sheet>
  );
}
