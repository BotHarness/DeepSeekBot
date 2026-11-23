import { useRef, useState, type ReactElement, type RefObject } from 'react';
import * as stylex from '@stylexjs/stylex';

import type { VoiceActions } from './actions-voice.js';
import { Button } from './ds/button.js';
import { FilterPicker } from './ds/filter-picker.js';
import { ConfirmDialog } from './ds/form-dialog.js';
import { Icon } from './ds/icon.js';
import { ink } from './ds/tobs.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { ModelBrandIcon, type ModelBrand } from './model-brand.js';
import { useMountedResource } from './mounted-resource.js';
import { CUSTOM_CHOICE } from './voice-options.js';
import type {
  VoiceCatalogCollection,
  VoiceCatalogInput,
  VoiceCatalogItem,
  VoiceCatalogPage,
} from './voice-bridge.js';

const styles = stylex.create({
  trigger: { width: '100%', justifyContent: 'flex-start', minWidth: 0 },
  value: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    textAlign: 'start',
  },
  arrow: { flexShrink: 0, color: ink.secondary },
});

const MAX_RESULTS = 200;
const SEARCH_DELAY_MS = 300;

export interface VoicePickerOption {
  readonly id: string;
  readonly name: string;
  readonly brand: ModelBrand | undefined;
}

export interface VoicePickerCatalog {
  readonly preset: string;
  readonly kind: VoiceCatalogInput['kind'];
  readonly key: string;
  readonly collection: 'models' | 'account';
  readonly collections: readonly VoiceCatalogCollection[];
  readonly browse: VoiceActions['browseVoiceCatalog'];
  readonly importVoice: VoiceActions['importSharedVoice'];
}

interface VoicePickerProps {
  readonly label: string;
  readonly value: string;
  readonly valueLabel?: string | undefined;
  readonly options: readonly VoicePickerOption[];
  readonly brand?: ModelBrand | undefined;
  readonly catalog?: VoicePickerCatalog | undefined;
  readonly t: BotHarnessTranslate;
  onChange(item: VoiceCatalogItem, fromCatalog: boolean): void;
}

export function VoiceCatalogPicker(props: VoicePickerProps): ReactElement {
  const { label, value, options, catalog, t } = props;
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<VoiceCatalogItem>();
  const importing = useRef(false);
  const [pending, setPending] = useState(false);
  const [importError, setImportError] = useState(false);
  const current = options.find((option) => option.id === value);
  const choose = (item: VoiceCatalogItem, fromCatalog: boolean) => {
    if (item.importFrom === undefined) {
      props.onChange(item, fromCatalog);
      return;
    }
    setImportError(false);
    setSelected(item);
  };
  const confirm = () => {
    if (
      catalog?.importVoice === undefined ||
      selected?.importFrom === undefined ||
      importing.current
    )
      return;
    importing.current = true;
    setPending(true);
    const { id, name, importFrom } = selected;
    void catalog
      .importVoice({
        preset: catalog.preset,
        key: catalog.key,
        ownerId: importFrom,
        voiceId: id,
        name,
        confirmed: true,
      })
      .then((item) => {
        props.onChange(item, true);
        setSelected(undefined);
      })
      .catch(() => setImportError(true))
      .finally(() => {
        importing.current = false;
        setPending(false);
      });
  };
  const brand = current?.brand ?? props.brand;
  return (
    <>
      <Button
        ref={anchor}
        type="button"
        variant="toolbar"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        icon={
          brand === undefined ? (
            <Icon name="audio-lines" size={14} />
          ) : (
            <ModelBrandIcon brand={brand} />
          )
        }
        xstyle={styles.trigger}
        onClick={() => setOpen((previous) => !previous)}
      >
        <span {...stylex.props(styles.value)}>{props.valueLabel ?? current?.name ?? label}</span>
        <span {...stylex.props(styles.arrow)}>
          <Icon name="chevron-down" size={12} />
        </span>
      </Button>
      {open ? (
        <VoiceCatalogPanel
          {...props}
          anchor={anchor}
          onChange={choose}
          onClose={() => setOpen(false)}
        />
      ) : null}
      {selected === undefined ? null : (
        <ConfirmDialog
          title={t('voice.catalog.importTitle', { name: selected.name })}
          description={t('voice.catalog.importDescription')}
          error={importError ? t('voice.catalog.importFailed') : undefined}
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          confirmLabel={t('voice.catalog.importConfirm')}
          danger={false}
          busy={pending}
          onCancel={() => {
            if (!importing.current) setSelected(undefined);
          }}
          onConfirm={confirm}
        />
      )}
    </>
  );
}

function VoiceCatalogPanel({
  anchor,
  label,
  value,
  options,
  catalog,
  brand,
  onChange,
  onClose,
  t,
}: VoicePickerProps & {
  readonly anchor: RefObject<HTMLButtonElement | null>;
  onClose(): void;
}): ReactElement {
  const primary = catalog?.collection ?? 'models';
  const [collection, setCollection] = useState<VoiceCatalogCollection>(primary);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState<VoiceCatalogPage>();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState<string>();
  const [previewFailed, setPreviewFailed] = useState(false);
  const abort = useRef<AbortController | undefined>(undefined);
  const player = useRef<HTMLAudioElement | undefined>(undefined);
  const stopPreview = () => {
    player.current?.pause();
    player.current = undefined;
    setPlaying(undefined);
  };
  const togglePreview = (item: VoiceCatalogItem) => {
    if (item.previewUrl === undefined) return;
    if (playing === item.id) {
      stopPreview();
      return;
    }
    player.current?.pause();
    const audio = new Audio(item.previewUrl);
    player.current = audio;
    setPreviewFailed(false);
    setPlaying(item.id);
    const finish = (failure: boolean) => {
      if (player.current !== audio) return;
      player.current = undefined;
      setPlaying(undefined);
      if (failure) setPreviewFailed(true);
    };
    audio.addEventListener('ended', () => finish(false));
    audio.addEventListener('error', () => finish(true));
    void audio.play().catch(() => finish(true));
  };
  const browse = catalog?.browse;
  const preset = catalog?.preset;
  const kind = catalog?.kind;
  const apiKey = catalog?.key.trim() ?? '';
  const enabled =
    browse !== undefined && apiKey !== '' && catalog?.collections.includes(collection) === true;
  const query = collection === 'models' ? '' : search.trim();
  const load = (cursor?: string) => {
    if (!enabled || preset === undefined || kind === undefined) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setPending(true);
    setFailed(false);
    void browse({ kind, preset, key: apiKey, collection, query, cursor }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setPage((old) => {
          const prefix = cursor === undefined ? [] : (old?.items ?? []);
          const merged = [
            ...new Map([...prefix, ...result.items].map((item) => [item.id, item])).values(),
          ];
          const items = collection === 'models' ? merged : merged.slice(0, MAX_RESULTS);
          return result.nextCursor === undefined
            ? { items }
            : { items, nextCursor: result.nextCursor };
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    setPage(undefined);
    setFailed(false);
    stopPreview();
    setPreviewFailed(false);
    setPending(enabled);
    if (!enabled) return;
    const timer = setTimeout(() => load(), SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      abort.current?.abort();
      player.current?.pause();
      player.current = undefined;
    };
  }, [preset, kind, apiKey, collection, query, browse, enabled]);
  const entries = new Map<
    string,
    {
      readonly item: VoiceCatalogItem;
      readonly brand: ModelBrand | undefined;
      readonly remote: boolean;
    }
  >();
  const needle = search.trim().toLowerCase();
  const results = page?.items ?? [];
  const matches =
    collection === 'models' && needle !== ''
      ? results.filter((item) =>
          [item.id, item.name].some((part) => part.toLowerCase().includes(needle)),
        )
      : results;
  for (const item of matches.slice(0, MAX_RESULTS))
    entries.set(item.id, { item, brand, remote: true });
  if (collection !== 'public')
    for (const item of options)
      if (
        !entries.has(item.id) &&
        (collection !== 'models' || page === undefined || item.id === CUSTOM_CHOICE)
      )
        entries.set(item.id, { item, brand: item.brand, remote: false });
  const hasPublic =
    apiKey !== '' && browse !== undefined && catalog?.collections.includes('public') === true;
  const full = matches.length >= MAX_RESULTS;
  const next = full ? undefined : page?.nextCursor;
  const notice = failed
    ? t('voice.catalog.failed')
    : previewFailed
      ? t('voice.catalog.previewFailed')
      : pending
        ? t('voice.catalog.loading')
        : catalog !== undefined &&
            catalog.collections.some((entry) => entry === primary) &&
            apiKey === ''
          ? t('voice.catalog.enterKey')
          : matches.length > MAX_RESULTS || (full && page?.nextCursor !== undefined)
            ? t('voice.catalog.narrow')
            : undefined;
  const footer = pending
    ? undefined
    : failed && enabled
      ? {
          label: t('voice.catalog.retry'),
          icon: <Icon name="refresh-cw" size={14} />,
          closeOnSelect: false,
          onSelect: () => load(),
        }
      : next === undefined
        ? undefined
        : {
            label: t('voice.catalog.more'),
            icon: <Icon name="chevron-down" size={14} />,
            closeOnSelect: false,
            onSelect: () => load(next),
          };
  return (
    <div ref={mount}>
      <FilterPicker
        label={label}
        value={value}
        onSelect={(id) => {
          const entry = entries.get(id);
          if (entry !== undefined) onChange(entry.item, entry.remote);
        }}
        closeOnSelect
        options={[...entries.values()].map((entry) => ({
          value: entry.item.id,
          label: entry.item.name,
          hint:
            entry.item.importFrom !== undefined
              ? t('voice.catalog.importRequired')
              : entry.remote && entry.item.name !== entry.item.id && collection === 'models'
                ? entry.item.id
                : undefined,
          icon:
            entry.brand === undefined ? (
              <Icon name="audio-lines" size={14} />
            ) : (
              <ModelBrandIcon brand={entry.brand} />
            ),
          filter: collection,
          search: entry.remote && query ? [entry.item.id, query] : [entry.item.id],
          disabled: entry.item.importFrom !== undefined && catalog?.importVoice === undefined,
          action:
            entry.item.previewUrl === undefined
              ? undefined
              : {
                  label:
                    playing === entry.item.id
                      ? t('voice.catalog.stopPreview')
                      : t('voice.catalog.preview'),
                  icon: <Icon name={playing === entry.item.id ? 'square' : 'play'} size={14} />,
                  pressed: playing === entry.item.id,
                  onPress: () => togglePreview(entry.item),
                },
        }))}
        allFilter={{
          key: primary,
          label: t('voice.catalog.available'),
          icon: <Icon name="audio-lines" size={16} />,
          onActivate: () => setCollection(primary),
        }}
        filters={
          hasPublic
            ? [
                {
                  key: 'public',
                  label: t('voice.catalog.public'),
                  icon: <Icon name="globe" size={16} />,
                  onActivate: () => setCollection('public'),
                },
              ]
            : []
        }
        filtersLabel={t('voice.catalog.filters')}
        searchLabel={t('voice.catalog.search', { label })}
        emptyLabel={t('voice.catalog.empty')}
        onSearchChange={setSearch}
        notice={notice}
        footer={footer}
        anchorRef={anchor}
        portalContainer={anchor.current?.closest('[role="dialog"]') ?? null}
        onClose={onClose}
      />
    </div>
  );
}
