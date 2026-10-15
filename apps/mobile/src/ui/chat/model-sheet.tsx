import { useState } from 'react';
import { ActivityIndicator, SectionList } from 'react-native';

import {
  currentModel,
  errorText,
  sameModel,
  type BotModel,
  type Loadable,
  type ModelCatalogEntry,
  type ModelPreset,
} from '../../host/bot-settings';
import { useDesignTheme } from '../design/theme';
import { SettingsGroupItem, SettingsRow } from '../primitives/settings-row';
import { CheckIcon } from '../shell/icons';
import { t } from '../strings';
import {
  Sheet,
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
  visible,
  botName,
  model,
  onRetry,
  onChoose,
  onPreset,
  onClose,
}: {
  visible: boolean;
  botName: string;
  model: Loadable<BotModel>;
  onRetry(): void;
  onChoose(model: BotModel, entry: ModelCatalogEntry): Promise<void>;
  onPreset(presetId: string): Promise<void>;
  onClose(): void;
}) {
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
  const trailing = (key: string, selected: boolean) =>
    busy === key ? (
      <ActivityIndicator />
    ) : selected ? (
      <CheckIcon color={theme.color.fg} size={theme.type.title.line} />
    ) : undefined;

  let body;
  if (model.status === 'loading') body = <SheetLoading />;
  else if (model.status === 'failed')
    body = <SheetFailed message={t.modelFailed} onRetry={onRetry} />;
  else {
    const value = model.value;
    const current = currentModel(value).route;
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
            trailing={trailing(item.key, selected)}
            onPress={() => run(item.key, () => onPreset(item.preset.id))}
          />
        );
      }
      const selected = sameModel(item.entry, current);
      const usable = item.entry.credential === undefined;
      return (
        <SettingsRow
          title={item.entry.modelName}
          detail={credentialHint(item.entry)}
          tone={usable ? 'fg' : 'muted'}
          selected={selected}
          on={SHEET_GROUP}
          trailing={trailing(item.key, selected)}
          {...(usable
            ? {
                onPress: () => run(item.key, () => onChoose(value, item.entry)),
              }
            : {})}
        />
      );
    };
    body = (
      <SectionList<Row, { title: string }>
        style={{ flexShrink: 1 }}
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
