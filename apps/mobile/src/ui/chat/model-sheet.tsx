import { useState, type ComponentType } from 'react';
import { SectionList } from 'react-native';

import {
  currentModel,
  errorText,
  sameModel,
  type BotModel,
  type Loadable,
  type ModelCatalogEntry,
  type ModelPreset,
} from '@botharness/host-client/bot-settings';
import {
  SettingsGroupItem,
  SettingsRow,
  type SettingsRowControl,
} from '../primitives/settings-row';
import { useStrings, t } from '../strings';
import { useDesignTheme } from '../design/theme';
import { SystemListSheet, type SystemListSection } from '../primitives/system-list-sheet';
import { modelEntryLabel } from './composer-labels';
import { ModelBrandIcon } from './model-brand-icon';
import {
  Sheet,
  type SheetPageProps,
  SheetCallout,
  SheetFailed,
  SheetHeading,
  SheetLoading,
  SheetNote,
  SHEET_GROUP,
} from './sheet';

type Row =
  | { kind: 'preset'; key: string; preset: ModelPreset }
  | { kind: 'model'; key: string; entry: ModelCatalogEntry };

function credentialHint(entry: ModelCatalogEntry): string {
  if (entry.credential === 'missing') return t.modelNeedsKey(entry.providerName);
  if (entry.credential === 'invalid') return t.modelKeyInvalid(entry.providerName);
  return entry.providerName;
}

export function ModelSheet({
  page,
  visible,
  botName,
  model,
  onRetry,
  onChoose,
  onPreset,
  onClose,
}: {
  page?: ComponentType<SheetPageProps> | undefined;
  visible: boolean;
  botName: string;
  model: Loadable<BotModel>;
  onRetry(): void;
  onChoose(model: BotModel, entry: ModelCatalogEntry): Promise<void>;
  onPreset(presetId: string): Promise<void>;
  onClose(): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const close = () => {
    if (busy !== undefined) return;
    setError(undefined);
    onClose();
  };
  const run = (key: string, work: () => Promise<void>) => {
    if (busy !== undefined) return;
    setBusy(key);
    setError(undefined);
    void work().then(
      () => {
        setBusy(undefined);
        onClose();
      },
      (cause: unknown) => {
        setBusy(undefined);
        setError(`${t.settingFailed} ${errorText(cause)}`);
      },
    );
  };
  const control = (key: string, selected: boolean): SettingsRowControl | undefined =>
    busy === key ? { kind: 'busy' } : selected ? { kind: 'check' } : undefined;

  if (SystemListSheet !== undefined && page === undefined) {
    const icon = theme.type.title.line;
    const title = t.modelTitle(botName);
    const notes = [
      ...(model.status === 'ready' && model.value.plan === undefined
        ? [{ kind: 'note' as const, key: 'inherited', text: t.modelInherited }]
        : []),
      ...(model.status === 'ready' && model.value.repair !== undefined
        ? [{ kind: 'note' as const, key: 'repair', text: t.modelRepair, tone: 'warning' as const }]
        : []),
      ...(error === undefined
        ? []
        : [{ kind: 'note' as const, key: 'error', text: error, tone: 'danger' as const }]),
    ];
    let sections: SystemListSection[];
    if (model.status === 'loading')
      sections = [{ key: 'loading', rows: [{ kind: 'progress', key: 'loading', label: title }] }];
    else if (model.status === 'failed')
      sections = [
        {
          key: 'failed',
          footer: t.modelFailed,
          rows: [{ kind: 'action', key: 'retry', label: t.tryAgain, onPress: onRetry }],
        },
      ];
    else {
      const value = model.value;
      const current = currentModel(value).route;
      const favorites = (value.favorites ?? []).flatMap((choice) => {
        if (choice.kind !== 'model') return [];
        const entry = value.models.find((item) => sameModel(item, choice));
        return entry === undefined ? [] : [entry];
      });
      const modelRow = (key: string, entry: ModelCatalogEntry) => {
        const usable = entry.credential === undefined;
        const label = modelEntryLabel(entry);
        return {
          kind: 'choice' as const,
          key,
          label: label.name,
          accessibilityLabel: `${entry.modelName}, ${credentialHint(entry)}`,
          detail: credentialHint(entry),
          leading: {
            size: icon,
            node: (
              <ModelBrandIcon
                brand={label.brand}
                size={icon}
                color={usable ? theme.color.fg : theme.color.muted}
              />
            ),
          },
          muted: !usable,
          selected: busy !== key && sameModel(entry, current),
          busy: busy === key,
          onPress: () => {
            if (usable) run(key, () => onChoose(value, entry));
          },
        };
      };
      sections = [
        ...(value.presets.length === 0
          ? []
          : [
              {
                key: 'presets',
                title: t.modelPresets,
                rows: value.presets.map((preset) => {
                  const key = `preset:${preset.id}`;
                  return {
                    kind: 'choice' as const,
                    key,
                    label: preset.name,
                    detail:
                      value.models.find((entry) => sameModel(entry, preset.orchestrator))
                        ?.modelName ?? preset.orchestrator.model,
                    selected: busy !== key && value.plan?.sourcePresetId === preset.id,
                    busy: busy === key,
                    onPress: () => run(key, () => onPreset(preset.id)),
                  };
                }),
              },
            ]),
        ...(favorites.length === 0
          ? []
          : [
              {
                key: 'favorites',
                title: t.modelSettings.favorites,
                rows: favorites.map((entry) =>
                  modelRow(`favorite:${entry.provider}:${entry.model}`, entry),
                ),
              },
            ]),
        value.models.length === 0
          ? {
              key: 'models',
              title: t.modelList,
              rows: [{ kind: 'note', key: 'none', text: t.modelNoneAvailable }],
            }
          : {
              key: 'models',
              title: t.modelList,
              rows: [...value.models]
                .sort(
                  (a, b) => Number(a.credential !== undefined) - Number(b.credential !== undefined),
                )
                .map((entry) => modelRow(`model:${entry.provider}:${entry.model}`, entry)),
            },
      ];
    }
    return (
      <SystemListSheet
        visible={visible}
        title={title}
        closeLabel={t.close}
        sections={notes.length === 0 ? sections : [{ key: 'notes', rows: notes }, ...sections]}
        onClose={close}
      />
    );
  }

  let body;
  if (model.status === 'loading') body = <SheetLoading />;
  else if (model.status === 'failed')
    body = <SheetFailed message={t.modelFailed} on="sheet" onRetry={onRetry} />;
  else {
    const value = model.value;
    const current = currentModel(value).route;
    const favorites = (value.favorites ?? []).flatMap((choice) => {
      if (choice.kind !== 'model') return [];
      const entry = value.models.find((item) => sameModel(item, choice));
      return entry === undefined ? [] : [entry];
    });
    const sections = [
      ...(value.presets.length === 0
        ? []
        : [
            {
              title: t.modelPresets,
              data: value.presets.map((preset): Row => ({
                kind: 'preset',
                key: `preset:${preset.id}`,
                preset,
              })),
            },
          ]),
      ...(favorites.length === 0
        ? []
        : [
            {
              title: t.modelSettings.favorites,
              data: favorites.map((entry): Row => ({
                kind: 'model',
                key: `favorite:${entry.provider}:${entry.model}`,
                entry,
              })),
            },
          ]),
      {
        title: t.modelList,
        data: [...value.models]
          .sort((a, b) => Number(a.credential !== undefined) - Number(b.credential !== undefined))
          .map((entry): Row => ({
            kind: 'model',
            key: `model:${entry.provider}:${entry.model}`,
            entry,
          })),
      },
    ];
    const renderRow = (item: Row) => {
      if (item.kind === 'preset') {
        const selected = value.plan?.sourcePresetId === item.preset.id;
        const detail =
          value.models.find((entry) => sameModel(entry, item.preset.orchestrator))?.modelName ??
          item.preset.orchestrator.model;
        return (
          <SettingsRow
            title={item.preset.name}
            detail={detail}
            selected={selected}
            on={SHEET_GROUP}
            control={control(item.key, selected)}
            onPress={() => run(item.key, () => onPreset(item.preset.id))}
          />
        );
      }
      const selected = sameModel(item.entry, current);
      const usable = item.entry.credential === undefined;
      return (
        <SettingsRow
          leading={
            <ModelBrandIcon
              brand={modelEntryLabel(item.entry).brand}
              size={theme.type.title.line * theme.fontScale}
              color={usable ? theme.color.fg : theme.color.muted}
            />
          }
          title={modelEntryLabel(item.entry).name}
          accessibilityLabel={`${item.entry.modelName}, ${credentialHint(item.entry)}`}
          detail={credentialHint(item.entry)}
          tone={usable ? 'fg' : 'muted'}
          selected={selected}
          on={SHEET_GROUP}
          control={control(item.key, selected)}
          {...(usable
            ? {
                onPress: () => run(item.key, () => onChoose(value, item.entry)),
              }
            : {})}
        />
      );
    };
    body = (
      <SectionList<Row, { title: string; data: readonly Row[] }>
        nestedScrollEnabled
        style={page !== undefined ? { flex: 1 } : { flexShrink: 1 }}
        sections={sections}
        keyExtractor={(row) => row.key}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <>
            {value.repair !== undefined ? (
              <SheetCallout tone="warning">{t.modelRepair}</SheetCallout>
            ) : null}
            {error === undefined ? null : <SheetCallout tone="danger">{error}</SheetCallout>}
          </>
        }
        ListEmptyComponent={<SheetNote>{t.modelNoneAvailable}</SheetNote>}
        renderSectionHeader={({ section }) =>
          section.data.length === 0 ? null : <SheetHeading>{section.title}</SheetHeading>
        }
        renderItem={({ item, index, section }) => (
          <SettingsGroupItem
            first={index === 0}
            last={index === section.data.length - 1}
            on={SHEET_GROUP}
          >
            {renderRow(item)}
          </SettingsGroupItem>
        )}
      />
    );
  }

  return (
    <Sheet
      page={page}
      visible={visible}
      label={t.modelTitle(botName)}
      title={t.modelTitle(botName)}
      {...(model.status === 'ready' && model.value.plan === undefined
        ? { subtitle: t.modelInherited }
        : {})}
      onClose={close}
    >
      {body}
    </Sheet>
  );
}
