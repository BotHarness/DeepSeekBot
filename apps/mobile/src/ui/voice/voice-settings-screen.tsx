import { useCallback, useRef, useState } from 'react';
import { ScrollView, View, type ViewInstance } from 'react-native';

import { errorText } from '@botharness/host-client/bot-settings';
import { providerBrand } from '@botharness/host-client/shared/model-brand';
import {
  presetsOf,
  servicesOf,
  voiceAccessDenied,
  type VoiceDefaultsView,
  type VoiceKind,
  type VoiceServiceHealth,
  type VoiceServicesView,
  type VoiceServiceView,
} from '@botharness/host-client/voice-providers';

import { ModelBrandIcon } from '../chat/model-brand-icon';
import { SHEET_GROUP, Sheet, SheetActions } from '../chat/sheet';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { useMounted } from '../mounted';
import { showActionMenu, showAppDialog } from '../primitives/app-dialog';
import { Button } from '../primitives/button';
import { CreationField } from '../primitives/creation-field';
import { SettingsForm, SettingsFormItem } from '../primitives/settings-form';
import { SettingsGroupItem, SettingsRow, SettingsSection } from '../primitives/settings-row';
import { SystemListSheet } from '../primitives/system-list-sheet';
import { LoadFailed, Loading, Notice } from '../request-parts';
import { useStrings } from '../strings';
import { VoiceServiceSheet, type VoiceServiceSheetPort } from './voice-service-sheet';
import { VoiceTemplateSheet, type VoiceTemplatePort } from './voice-template-sheet';

export interface VoiceSettingsPort extends VoiceServiceSheetPort, VoiceTemplatePort {
  load(): Promise<VoiceServicesView>;
  remove(id: string): Promise<void>;
  test(id: string): Promise<VoiceServiceHealth>;
  setDefault(
    kind: VoiceKind,
    providerId: string | null,
    voiceId?: string,
  ): Promise<VoiceDefaultsView>;
}

const PROVIDER_VOICE = '\u0000provider';
const NONE = '\u0000none';

type Health = VoiceServiceHealth | 'testing';

type Choosing =
  | { kind: VoiceKind; field: 'service' }
  | { kind: 'tts'; field: 'voice'; provider: VoiceServiceView };

interface ChoiceRow {
  readonly id: string;
  readonly name: string;
  readonly service?: VoiceServiceView;
}

function ChoiceSheet({
  title,
  rows,
  value,
  custom,
  busy,
  error,
  onChoose,
  onClose,
}: {
  title: string;
  rows: readonly ChoiceRow[];
  value: string;
  custom?: { label: string; initial: string; save: string } | undefined;
  busy: boolean;
  error: string | undefined;
  onChoose(id: string): void;
  onClose(): void;
}) {
  const theme = useDesignTheme();
  const close = useStrings().close;
  const [text, setText] = useState(custom?.initial ?? '');
  const testID = (row: ChoiceRow) =>
    `voice-choice-${row.service?.id ?? (row.id === NONE ? 'none' : row.id === PROVIDER_VOICE ? 'provider' : row.id)}`;
  if (custom === undefined && SystemListSheet !== undefined)
    return (
      <SystemListSheet
        visible
        title={title}
        closeLabel={close}
        onClose={onClose}
        sections={[
          {
            key: 'choices',
            rows: [
              ...rows.map((row) => ({
                kind: 'choice' as const,
                key: row.id,
                testID: testID(row),
                label: row.name,
                ...(row.service === undefined
                  ? {}
                  : {
                      leading: {
                        size: theme.type.title.line,
                        node: (
                          <ModelBrandIcon
                            brand={providerBrand(row.service.preset, row.service.name)}
                            size={theme.type.title.line}
                            color={theme.color.muted}
                          />
                        ),
                      },
                    }),
                selected: row.id === value,
                disabled: busy,
                onPress: () => onChoose(row.id),
              })),
              ...(error === undefined
                ? []
                : [{ kind: 'note' as const, key: 'error', text: error, tone: 'danger' as const }]),
            ],
          },
        ]}
      />
    );
  return (
    <Sheet visible title={title} label={title} onClose={onClose} avoidKeyboard>
      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {rows.map((row, index) => (
          <SettingsGroupItem
            key={row.id}
            first={index === 0}
            last={index === rows.length - 1}
            on={SHEET_GROUP}
          >
            <SettingsRow
              on={SHEET_GROUP}
              testID={testID(row)}
              {...(row.service === undefined
                ? {}
                : {
                    leading: (
                      <ModelBrandIcon
                        brand={providerBrand(row.service.preset, row.service.name)}
                        size={theme.type.title.line}
                        color={theme.color.fg}
                      />
                    ),
                  })}
              title={row.name}
              selected={row.id === value}
              control={busy ? undefined : row.id === value ? { kind: 'check' } : undefined}
              onPress={busy ? undefined : () => onChoose(row.id)}
            />
          </SettingsGroupItem>
        ))}
        {custom === undefined ? null : (
          <View style={{ paddingHorizontal: space.x5, paddingTop: space.x5 }}>
            <CreationField
              testID="voice-choice-custom"
              accessibilityLabel={custom.label}
              value={text}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setText}
            />
          </View>
        )}
        {error === undefined ? null : (
          <View style={{ padding: space.x5 }}>
            <Notice tone="danger">{error}</Notice>
          </View>
        )}
        {custom === undefined ? null : (
          <SheetActions>
            <Button
              testID="voice-choice-custom-save"
              label={custom.save}
              tone="primary"
              on={SHEET_GROUP}
              busy={busy}
              disabled={text.trim() === '' || text.trim() === custom.initial}
              onPress={() => onChoose(text.trim())}
            />
          </SheetActions>
        )}
      </ScrollView>
    </Sheet>
  );
}

export function VoiceSettings({ port }: { port: VoiceSettingsPort }) {
  const t = useStrings();
  const copy = t.voiceSettings;
  const theme = useDesignTheme();
  const [view, setView] = useState<VoiceServicesView>();
  const [loadError, setLoadError] = useState<string>();
  const [denied, setDenied] = useState(false);
  const [creating, setCreating] = useState<VoiceKind>();
  const [editing, setEditing] = useState<{ kind: VoiceKind; service: VoiceServiceView }>();
  const [choosing, setChoosing] = useState<Choosing>();
  const [busy, setBusy] = useState(false);
  const [choiceError, setChoiceError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [health, setHealth] = useState<Record<string, Health>>({});
  const generation = useRef(0);

  const load = useCallback(() => {
    const ticket = ++generation.current;
    setLoadError(undefined);
    port.load().then(
      (next) => {
        if (ticket === generation.current) setView(next);
      },
      (cause: unknown) => {
        if (ticket !== generation.current) return;
        if (voiceAccessDenied(cause)) setDenied(true);
        else setLoadError(errorText(cause));
      },
    );
  }, [port]);
  const mount = useMounted<ViewInstance>(() => load(), [load]);

  const test = (service: VoiceServiceView) => {
    setHealth((current) => ({ ...current, [service.id]: 'testing' }));
    port.test(service.id).then(
      (result) => setHealth((current) => ({ ...current, [service.id]: result })),
      (cause: unknown) =>
        setHealth((current) => ({
          ...current,
          [service.id]: {
            ok: false,
            message: voiceAccessDenied(cause) ? copy.ownerOnly : errorText(cause),
          },
        })),
    );
  };
  const remove = (service: VoiceServiceView) => {
    showAppDialog(copy.removeTitle(service.name), copy.removeBody, [
      { text: copy.cancel, style: 'cancel' },
      {
        text: copy.remove,
        style: 'destructive',
        onPress: () => {
          setActionError(undefined);
          port
            .remove(service.id)
            .then(load, (cause: unknown) =>
              setActionError(voiceAccessDenied(cause) ? copy.ownerOnly : errorText(cause)),
            );
        },
      },
    ]);
  };
  const choose = (target: Choosing, id: string) => {
    if (busy) return;
    const kind = target.kind;
    const providerId = target.field === 'service' ? (id === NONE ? null : id) : target.provider.id;
    const voiceId = target.field === 'voice' && id !== PROVIDER_VOICE ? id : undefined;
    setBusy(true);
    setChoiceError(undefined);
    port.setDefault(kind, providerId, voiceId).then(
      (defaults) => {
        setBusy(false);
        setView((current) => (current === undefined ? current : { ...current, defaults }));
        setChoosing(undefined);
      },
      (cause: unknown) => {
        setBusy(false);
        setChoiceError(voiceAccessDenied(cause) ? copy.ownerOnly : errorText(cause));
      },
    );
  };

  const serviceRow = (current: VoiceServicesView, kind: VoiceKind, service: VoiceServiceView) => {
    const state = health[service.id];
    const preset = presetsOf(current, kind).find((entry) => entry.id === service.preset);
    const missingKey = preset?.keyRequired === true && !service.keySet;
    const detail =
      state === 'testing'
        ? copy.testing
        : state !== undefined
          ? state.ok
            ? copy.healthy(state.latencyMs)
            : copy.unhealthy(state.message)
          : missingKey
            ? copy.missingKey
            : service.hasTemplate === true
              ? copy.template.service
              : (preset?.name ?? service.preset);
    const dot =
      state === undefined || state === 'testing'
        ? missingKey
          ? theme.color.warning
          : undefined
        : state.ok
          ? theme.color.success
          : theme.color.danger;
    return (
      <SettingsRow
        key={service.id}
        on={SHEET_GROUP}
        testID={`voice-service-${service.id}`}
        leading={
          <ModelBrandIcon
            brand={providerBrand(service.preset, service.name)}
            size={theme.type.title.line * theme.fontScale}
            color={theme.color.fg}
          />
        }
        title={service.name}
        detail={detail}
        detailDot={dot}
        control={state === 'testing' ? { kind: 'busy' } : undefined}
        accessibilityLabel={`${service.name}, ${detail}`}
        onPress={() =>
          showActionMenu(copy.serviceActions(service.name), [
            { text: copy.test, icon: 'connection', onPress: () => test(service) },
            ...(service.hasTemplate === true
              ? [
                  {
                    text: copy.template.edit,
                    icon: 'edit' as const,
                    onPress: () => setEditing({ kind, service }),
                  },
                ]
              : []),
            {
              text: copy.remove,
              icon: 'delete',
              style: 'destructive',
              onPress: () => remove(service),
            },
          ])
        }
      />
    );
  };

  const section = (current: VoiceServicesView, kind: VoiceKind) => {
    const services = servicesOf(current, kind);
    return (
      <SettingsSection
        key={kind}
        title={kind === 'tts' ? copy.tts : copy.asr}
        on={SHEET_GROUP}
        {...(services.length === 0
          ? { footer: kind === 'tts' ? copy.emptyTts : copy.emptyAsr }
          : {})}
      >
        {services.map((service) => serviceRow(current, kind, service))}
        <SettingsRow
          on={SHEET_GROUP}
          testID={`voice-add-${kind}`}
          title={kind === 'tts' ? copy.addTts : copy.addAsr}
          tone="accent"
          control={{ kind: 'add' }}
          onPress={() => setCreating(kind)}
        />
      </SettingsSection>
    );
  };

  const defaults = (current: VoiceServicesView) => {
    const rows = (['tts', 'asr'] as const).flatMap((kind) => {
      const services = servicesOf(current, kind);
      if (services.length === 0) return [];
      const binding = kind === 'tts' ? current.defaults.tts : current.defaults.asr;
      const provider = services.find((entry) => entry.id === binding?.providerId);
      const serviceRow = (
        <SettingsRow
          key={`${kind}-service`}
          on={SHEET_GROUP}
          testID={`voice-default-${kind}`}
          title={kind === 'tts' ? copy.defaultTts : copy.defaultAsr}
          control={{ kind: 'value', text: provider?.name ?? copy.none, chevron: true }}
          onPress={() => {
            setChoiceError(undefined);
            setChoosing({ kind, field: 'service' });
          }}
        />
      );
      if (kind === 'asr' || provider === undefined) return [serviceRow];
      const voices = current.presets.find((entry) => entry.id === provider.preset)?.voices ?? [];
      const voiceId = current.defaults.tts?.voiceId;
      const voiceName =
        voiceId === undefined
          ? copy.providerVoice
          : (voices.find((voice) => voice.id === voiceId)?.name ?? voiceId);
      return [
        serviceRow,
        <SettingsRow
          key="tts-voice"
          on={SHEET_GROUP}
          testID="voice-default-voice"
          title={copy.defaultVoice}
          control={{ kind: 'value', text: voiceName, chevron: true }}
          onPress={() => {
            setChoiceError(undefined);
            setChoosing({ kind: 'tts', field: 'voice', provider });
          }}
        />,
      ];
    });
    if (rows.length === 0) return null;
    return (
      <SettingsSection on={SHEET_GROUP} footer={copy.defaultFooter}>
        {rows}
      </SettingsSection>
    );
  };

  const choiceSheet = () => {
    if (choosing === undefined || view === undefined) return null;
    if (choosing.field === 'service') {
      const services = servicesOf(view, choosing.kind);
      const binding = choosing.kind === 'tts' ? view.defaults.tts : view.defaults.asr;
      return (
        <ChoiceSheet
          title={choosing.kind === 'tts' ? copy.defaultTts : copy.defaultAsr}
          rows={[
            { id: NONE, name: copy.none },
            ...services.map((service) => ({ id: service.id, name: service.name, service })),
          ]}
          value={binding?.providerId ?? NONE}
          busy={busy}
          error={choiceError}
          onChoose={(id) => choose(choosing, id)}
          onClose={() => setChoosing(undefined)}
        />
      );
    }
    const { provider } = choosing;
    const voices = view.presets.find((entry) => entry.id === provider.preset)?.voices ?? [];
    const voiceId = view.defaults.tts?.voiceId;
    const listed = voiceId === undefined || voices.some((voice) => voice.id === voiceId);
    return (
      <ChoiceSheet
        title={copy.defaultVoice}
        rows={[
          {
            id: PROVIDER_VOICE,
            name:
              provider.defaultVoice === undefined
                ? copy.providerVoice
                : `${copy.providerVoice} · ${provider.defaultVoice}`,
          },
          ...voices,
        ]}
        value={voiceId ?? PROVIDER_VOICE}
        custom={{
          label: copy.customVoice,
          initial: listed ? '' : (voiceId ?? ''),
          save: copy.save,
        }}
        busy={busy}
        error={choiceError}
        onChoose={(id) => choose(choosing, id)}
        onClose={() => setChoosing(undefined)}
      />
    );
  };

  return (
    <View ref={mount} style={{ flex: 1 }}>
      <SettingsForm testID="voice-settings">
        {denied ? (
          <SettingsFormItem>
            <Notice tone="warning">{copy.ownerOnly}</Notice>
          </SettingsFormItem>
        ) : null}
        {loadError !== undefined ? (
          <SettingsFormItem>
            <LoadFailed error={loadError} onRetry={load} />
          </SettingsFormItem>
        ) : null}
        {view === undefined && loadError === undefined && !denied ? (
          <SettingsFormItem>
            <Loading />
          </SettingsFormItem>
        ) : null}
        {actionError === undefined ? null : (
          <SettingsFormItem>
            <Notice tone="danger">{actionError}</Notice>
          </SettingsFormItem>
        )}
        {view === undefined ? null : section(view, 'tts')}
        {view === undefined ? null : section(view, 'asr')}
        {view === undefined ? null : defaults(view)}
      </SettingsForm>
      {creating === undefined || view === undefined ? null : (
        <VoiceServiceSheet
          kind={creating}
          view={view}
          port={port}
          onClose={() => setCreating(undefined)}
          onAdded={(service) => {
            setCreating(undefined);
            load();
            test(service);
          }}
        />
      )}
      {editing === undefined ? null : (
        <VoiceTemplateSheet
          kind={editing.kind}
          service={editing.service}
          port={port}
          onClose={() => setEditing(undefined)}
          onSaved={(service) => {
            setEditing(undefined);
            load();
            test(service);
          }}
        />
      )}
      {choiceSheet()}
    </View>
  );
}
