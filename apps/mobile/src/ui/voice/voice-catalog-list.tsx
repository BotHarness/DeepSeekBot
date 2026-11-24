import { useRef, useState } from 'react';
import { FlatList, Keyboard, Pressable, View, type ViewInstance } from 'react-native';

import type { ModelBrand } from '@botharness/host-client/shared/model-brand';
import {
  CATALOG_MAX_RESULTS,
  CUSTOM_CHOICE,
  mergeCatalogItems,
} from '@botharness/host-client/shared/voice-options';
import { voiceAccessDenied, type VoiceKind } from '@botharness/host-client/voice-providers';
import type {
  VoiceCatalogCollection,
  VoiceCatalogImportInput,
  VoiceCatalogInput,
  VoiceCatalogItem,
  VoiceCatalogPage,
} from '@botharness/host-protocol/voice-catalog';

import { ModelBrandIcon } from '../chat/model-brand-icon';
import { ModelPickerFilters } from '../chat/model-picker-filters';
import { SHEET_GROUP, SheetActions, SheetNote } from '../chat/sheet';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { confirmAppDialog } from '../primitives/app-dialog';
import { Button } from '../primitives/button';
import { Chip } from '../primitives/chip';
import { DrawerHeader } from '../primitives/drawer-header';
import { SearchField } from '../primitives/search-field';
import { SettingsGroupItem, SettingsRow } from '../primitives/settings-row';
import { SystemSymbol } from '../primitives/system-symbol';
import { useMounted } from '../mounted';
import { useStrings } from '../strings';
import { useVoiceSample } from './voice-sample';

const SEARCH_DELAY_MS = 300;

export interface VoiceCatalogOption {
  readonly id: string;
  readonly name: string;
  readonly brand: ModelBrand | undefined;
}

export interface VoiceCatalogSource {
  readonly preset: string;
  readonly kind: VoiceKind;
  readonly key: string;
  readonly collection: 'models' | 'account';
  readonly collections: readonly VoiceCatalogCollection[];
  browse(input: VoiceCatalogInput): Promise<VoiceCatalogPage>;
  importVoice(input: VoiceCatalogImportInput): Promise<VoiceCatalogItem>;
}

interface Entry {
  readonly item: VoiceCatalogItem;
  readonly brand: ModelBrand | undefined;
  readonly remote: boolean;
}

type Failure = 'failed' | 'denied' | undefined;

function SampleButton({
  name,
  playing,
  testID,
  onPress,
}: {
  name: string;
  playing: boolean;
  testID: string;
  onPress(): void;
}) {
  const t = useStrings().voiceSettings.catalog;
  const theme = useDesignTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={playing ? t.stopPreview(name) : t.preview(name)}
      accessibilityState={{ selected: playing }}
      hitSlop={space.x2}
      style={({ pressed }) => ({
        width: theme.touch,
        height: theme.touch,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? theme.layer.raised.pressed : 'transparent',
      })}
    >
      <SystemSymbol
        name={
          playing
            ? { ios: 'stop.circle.fill', android: 'stop_circle' }
            : { ios: 'play.circle', android: 'play_circle' }
        }
        size={theme.type.title.line}
        color={playing ? theme.color.accent : theme.color.muted}
      />
    </Pressable>
  );
}

export function VoiceCatalogList({
  title,
  value,
  options,
  brand,
  catalog,
  testID,
  onChoose,
  onBack,
}: {
  title: string;
  value: string;
  options: readonly VoiceCatalogOption[];
  brand: ModelBrand | undefined;
  catalog?: VoiceCatalogSource | undefined;
  testID: string;
  onChoose(item: VoiceCatalogItem, fromCatalog: boolean): void;
  onBack(): void;
}) {
  const t = useStrings().voiceSettings;
  const theme = useDesignTheme();
  const primary = catalog?.collection ?? 'models';
  const [collection, setCollection] = useState<VoiceCatalogCollection>(primary);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState<VoiceCatalogPage>();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure>();
  const [importing, setImporting] = useState<string>();
  const [importFailed, setImportFailed] = useState(false);
  const generation = useRef(0);
  const sample = useVoiceSample();
  const stopSample = sample.stop;
  const apiKey = catalog?.key.trim() ?? '';
  const enabled =
    catalog !== undefined && apiKey !== '' && catalog.collections.includes(collection);
  const query = collection === 'models' ? '' : search.trim();
  const load = (cursor?: string) => {
    if (!enabled) return;
    const ticket = ++generation.current;
    setPending(true);
    setFailure(undefined);
    catalog
      .browse({
        kind: catalog.kind,
        preset: catalog.preset,
        key: apiKey,
        collection,
        query,
        ...(cursor === undefined ? {} : { cursor }),
      })
      .then(
        (result) => {
          if (ticket !== generation.current) return;
          setPage((old) => {
            const items = mergeCatalogItems(
              cursor === undefined ? [] : (old?.items ?? []),
              result.items,
              collection,
            );
            return result.nextCursor === undefined
              ? { items }
              : { items, nextCursor: result.nextCursor };
          });
          setPending(false);
        },
        (cause: unknown) => {
          if (ticket !== generation.current) return;
          setFailure(voiceAccessDenied(cause) ? 'denied' : 'failed');
          setPending(false);
        },
      );
  };
  const loadRef = useRef(load);
  loadRef.current = load;
  const mount = useMounted<ViewInstance>(() => {
    generation.current += 1;
    setPage(undefined);
    setFailure(undefined);
    stopSample();
    setPending(enabled);
    if (!enabled) return stopSample;
    const timer = setTimeout(() => loadRef.current(), SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      generation.current += 1;
      stopSample();
    };
  }, [catalog?.preset, catalog?.kind, apiKey, collection, query, enabled, stopSample]);

  const needle = search.trim().toLowerCase();
  const results = page?.items ?? [];
  const matches =
    collection === 'models' && needle !== ''
      ? results.filter((item) =>
          [item.id, item.name].some((part) => part.toLowerCase().includes(needle)),
        )
      : results;
  const entries = new Map<string, Entry>();
  for (const item of matches.slice(0, CATALOG_MAX_RESULTS))
    entries.set(item.id, { item, brand, remote: true });
  if (collection !== 'public')
    for (const option of options) {
      const local =
        needle === '' ||
        option.id === CUSTOM_CHOICE ||
        [option.id, option.name].some((part) => part.toLowerCase().includes(needle));
      if (
        local &&
        !entries.has(option.id) &&
        (collection !== 'models' || page === undefined || option.id === CUSTOM_CHOICE)
      )
        entries.set(option.id, { item: option, brand: option.brand, remote: false });
    }
  const rows = [...entries.values()];
  const hasPublic = apiKey !== '' && catalog?.collections.includes('public') === true;
  const full = matches.length >= CATALOG_MAX_RESULTS;
  const next = full ? undefined : page?.nextCursor;
  const notice =
    failure === 'denied'
      ? t.catalog.denied
      : failure === 'failed'
        ? t.catalog.failed
        : importFailed
          ? t.catalog.importFailed
          : sample.failed
            ? t.catalog.previewFailed
            : catalog !== undefined && apiKey === ''
              ? t.catalog.enterKey
              : full && page?.nextCursor !== undefined
                ? t.catalog.narrow
                : undefined;
  const choose = (entry: Entry) => {
    Keyboard.dismiss();
    if (importing !== undefined) return;
    const { item } = entry;
    if (item.importFrom === undefined || catalog === undefined) {
      stopSample();
      onChoose(item, entry.remote);
      return;
    }
    const owner = item.importFrom;
    void confirmAppDialog(
      t.catalog.importTitle(item.name),
      t.catalog.importBody,
      t.catalog.importConfirm,
    ).then((confirmed) => {
      if (!confirmed) return;
      setImporting(item.id);
      setImportFailed(false);
      catalog
        .importVoice({
          preset: catalog.preset,
          key: apiKey,
          ownerId: owner,
          voiceId: item.id,
          name: item.name,
          confirmed: true,
        })
        .then(
          (voice) => {
            setImporting(undefined);
            stopSample();
            onChoose(voice, true);
          },
          () => {
            setImporting(undefined);
            setImportFailed(true);
          },
        );
    });
  };
  const pick = (next: VoiceCatalogCollection) => {
    setCollection(next);
    setImportFailed(false);
  };
  return (
    <View ref={mount} testID={testID} style={{ flexShrink: 1 }}>
      <View style={{ paddingHorizontal: space.x5, paddingBottom: space.x4 }}>
        <DrawerHeader title={title} onBack={onBack} />
      </View>
      <SearchField
        testID={`${testID}-search`}
        value={search}
        onChangeText={setSearch}
        placeholder={t.catalog.search}
        inset={space.x5}
      />
      {hasPublic ? (
        <ModelPickerFilters label={t.catalog.filters}>
          <Chip
            testID={`${testID}-filter-available`}
            label={t.catalog.available}
            selected={collection === primary}
            onPress={() => pick(primary)}
          />
          <Chip
            testID={`${testID}-filter-public`}
            label={t.catalog.public}
            selected={collection === 'public'}
            onPress={() => pick(collection === 'public' ? primary : 'public')}
          />
        </ModelPickerFilters>
      ) : null}
      {notice === undefined ? null : (
        <SheetNote
          tone={failure === undefined && !importFailed && !sample.failed ? 'muted' : 'danger'}
        >
          {notice}
        </SheetNote>
      )}
      <FlatList
        nestedScrollEnabled
        data={rows}
        keyExtractor={(entry) => entry.item.id}
        style={{ flexGrow: 0, flexShrink: 1 }}
        contentContainerStyle={{ paddingTop: space.x3 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={pending ? undefined : <SheetNote>{t.catalog.empty}</SheetNote>}
        renderItem={({ item: entry, index }) => {
          const { item } = entry;
          const selected = item.id === value;
          const hint =
            item.importFrom !== undefined
              ? t.catalog.importRequired
              : entry.remote && item.name !== item.id && collection === 'models'
                ? item.id
                : undefined;
          return (
            <SettingsGroupItem
              first={index === 0}
              last={index === rows.length - 1}
              on={SHEET_GROUP}
            >
              <SettingsRow
                on={SHEET_GROUP}
                testID={`${testID}-item-${item.id === CUSTOM_CHOICE ? 'custom' : item.id}`}
                leading={
                  <ModelBrandIcon
                    brand={entry.brand}
                    size={theme.type.title.line * theme.fontScale}
                    color={theme.color.fg}
                  />
                }
                title={item.name}
                detail={hint}
                selected={selected}
                control={
                  importing === item.id
                    ? { kind: 'busy' }
                    : selected
                      ? { kind: 'check' }
                      : undefined
                }
                accessory={
                  item.previewUrl === undefined ? undefined : (
                    <SampleButton
                      name={item.name}
                      playing={sample.playing === item.id}
                      testID={`${testID}-sample-${item.id}`}
                      onPress={() => sample.toggle(item.id, item.previewUrl!)}
                    />
                  )
                }
                onPress={() => choose(entry)}
              />
            </SettingsGroupItem>
          );
        }}
        ListFooterComponent={
          pending ? (
            <SheetNote>{t.catalog.loading}</SheetNote>
          ) : failure === 'failed' && enabled ? (
            <SheetActions>
              <Button
                testID={`${testID}-retry`}
                label={t.catalog.retry}
                on={SHEET_GROUP}
                onPress={() => load()}
              />
            </SheetActions>
          ) : next === undefined ? undefined : (
            <SheetActions>
              <Button
                testID={`${testID}-more`}
                label={t.catalog.more}
                on={SHEET_GROUP}
                onPress={() => load(next)}
              />
            </SheetActions>
          )
        }
      />
    </View>
  );
}
