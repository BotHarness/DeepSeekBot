import * as stylex from '@stylexjs/stylex';
import { useState, type ReactElement } from 'react';
import { space } from '../../ds/tobs.stylex.js';
import { avatarFrameStyles } from '../../ds/avatar-frame.js';
import { Icon } from '../../ds/icon.js';
import { Button } from '../../ds/button.js';
import { joinClass } from '../../ds/class-name.js';
import { AvatarPresetPicker, type AvatarPresetChoice } from '../../avatar-preset-picker.js';
import {
  AVATAR_FAMILIES,
  AVATAR_HEADPIECES,
  withAvatarBuiltInHeadpiece,
  builtInAvatarHeadpiece,
  detailedAvatarRecipe,
  type IllustratedAvatarRecipe,
  withAvatarCustomPart,
  wornAvatarPart,
  hairPieceStart,
  headpieceStart,
  isHairPartSlot,
  isReplacePartSlot,
  replacePartStart,
  type PartSlot,
  customPartId,
  type PixelCustomPart,
  seededAvatarFor,
  type AvatarFamily,
  type AvatarRecipe,
} from './avatar-editor-options.js';
import type { PartLibraryEntry } from '../../../../../core/src/bots/part-library.js';
import { CustomPartEditor } from '../../custom-part-editor.js';
import {
  PersonaBotAvatar,
  PersonaBotStatusBadges,
  normalizePersonaBotActivity,
} from '../../avatar.js';
import { ActionButton } from '../../ds/action-button.js';
import type { BotSummary } from '../../store.js';
import type { BotHarnessTranslate } from '../../locale.js';
import {
  type Key,
  PIECE_COLORS,
  MOVED,
  FAMILIES,
  type Fields,
  PART_CATEGORY,
  withPart,
  shuffled,
  categoriesFor,
  SLOT_CATEGORY,
  hiddenFor,
  swatchesFor,
  OptionTile,
  getPixelPresets,
} from './avatar-editor-options.js';

export interface PartLibraryActions {
  load(): Promise<PartLibraryEntry[] | undefined>;
  add(part: PixelCustomPart, name: string, parent?: string): Promise<PartLibraryEntry | undefined>;
  exportParts?: (
    id?: string,
    part?: PixelCustomPart,
  ) => Promise<{ fileName: string; data: string } | undefined>;
  importParts?: (data: string) => Promise<
    | {
        added: PartLibraryEntry[];
        refused: number;
        image?: {
          width: number;
          height: number;
          colors: number;
          slots: string[];
        };
      }
    | { error: string }
  >;
  importImage?: (
    data: string,
    slot: string,
    colors: number,
    name: string,
  ) => Promise<PartLibraryEntry | { error: string }>;
}

interface PendingImage {
  data: string;
  name: string;
  width: number;
  height: number;
  colors: number;
  slots: PartSlot[];
  slot: PartSlot;
  keep: number;
}

const ORIGIN_FILTERS = [
  'all',
  'drawn',
  'derived',
  'imported-bot',
  'imported-file',
  'imported-image',
] as const;

type OriginFilter = (typeof ORIGIN_FILTERS)[number];

const ORIGIN_KEYS = {
  drawn: 'drawn',
  derived: 'derived',
  'imported-bot': 'importedBot',
  'imported-file': 'importedFile',
  'imported-image': 'importedImage',
} as const;

const originKey = (origin: Exclude<OriginFilter, 'all'>) => ORIGIN_KEYS[origin];

const MAX_IMAGE_KEEP = 32;

const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

function download(fileName: string, base64: string, type: string): void {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function readBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const editorStyles = stylex.create({
  previewColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    width: 'fit-content',
    maxWidth: '100%',
    justifySelf: 'center',
  },
  fullAction: { width: '100%' },
  remove: { alignSelf: 'center' },
  actions: { marginTop: space.x3 },
});

export function AvatarAppearanceEditor({
  bot,
  channelId,
  onSave,
  onUpload,
  onChooseImage,
  onRemoveImage,
  imageBusy = false,
  library,
  t,
}: {
  bot: BotSummary;
  channelId: string;
  onSave(channelId: string, recipe: AvatarRecipe): Promise<boolean>;
  onUpload?: (() => void) | undefined;
  onChooseImage?: ((image: string) => Promise<boolean>) | undefined;
  onRemoveImage?: (() => void) | undefined;
  imageBusy?: boolean | undefined;
  library?: PartLibraryActions | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const [preset, setPreset] = useState<AvatarPresetChoice<AvatarRecipe>>();
  const [parts, setParts] = useState<PartLibraryEntry[]>();
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
  const [libraryNote, setLibraryNote] = useState<string>();
  const [pendingImage, setPendingImage] = useState<PendingImage>();
  const [drawing, setDrawing] = useState<{
    slot: PartSlot;
    base: IllustratedAvatarRecipe;
    restore: IllustratedAvatarRecipe;
    backdrop?: IllustratedAvatarRecipe;
    initial?: PixelCustomPart;
    parent?: string;
    note?: string;
  }>();
  const [drafts, setDrafts] = useState<Partial<Record<AvatarFamily, AvatarRecipe>>>();
  const [family, setFamily] = useState<AvatarFamily>('illustrated');
  const [category, setCategory] = useState('hair');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const draft = drafts?.[family];
  const spec = FAMILIES[family];
  const seed = bot.displayName || bot.slug;
  const start = () => {
    const saved =
      (preset?.kind === 'pixel' ? preset.recipe : bot.appearance?.recipe) ??
      seededAvatarFor(seed, bot.avatarSeed);
    setDrawing(undefined);
    setDrafts({ [saved.family]: { ...saved } });
    setFamily(saved.family);
    setCategory(saved.family === 'line' ? 'eyes' : 'hair');
    setFailed(false);
  };
  const update = (next: AvatarRecipe) =>
    setDrafts((current) => ({ ...current, [next.family]: next }));
  const choose = (next: AvatarFamily) => {
    setFamily(next);
    setCategory(next === 'line' ? 'eyes' : 'hair');
    setDrafts((current) => ({
      ...current,
      [next]:
        current?.[next] ??
        (bot.appearance?.recipe.family === next
          ? bot.appearance.recipe
          : FAMILIES[next].seeded(seed, bot.avatarSeed)),
    }));
  };
  const pixel = draft ?? (preset?.kind === 'pixel' ? preset.recipe : undefined);
  const image = preset?.kind === 'tilties' ? preset.image : undefined;
  const editing = draft !== undefined || preset !== undefined;
  const saving = busy || imageBusy;
  const save = async () => {
    if (saving) return;
    setBusy(true);
    setFailed(false);
    try {
      const saved = pixel
        ? await onSave(channelId, pixel)
        : image !== undefined && (await onChooseImage?.(image));
      if (saved) {
        setDrafts(undefined);
        setPreset(undefined);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const state = normalizePersonaBotActivity(bot.aggregateState);
  const recipe = editing ? pixel : bot.appearance?.recipe;
  const fields = (draft?.family === 'illustrated'
    ? detailedAvatarRecipe(draft)
    : draft) as unknown as Fields | undefined;
  const set = (key: string, value: string | number) => {
    if (draft) update(withPart(draft, key, value));
  };
  const pieceSlot = draft?.family === 'illustrated' ? PART_CATEGORY[category] : undefined;
  const pieceWorn =
    pieceSlot !== undefined &&
    draft?.family === 'illustrated' &&
    wornAvatarPart(draft, pieceSlot) !== undefined;
  const builtIn = (key: string, value: string): AvatarRecipe => {
    const next = withPart(draft!, key, value);
    const slot = PART_CATEGORY[key];
    return slot && next.family === 'illustrated' && wornAvatarPart(next, slot)
      ? withAvatarCustomPart(next, slot, undefined)
      : next;
  };
  const originLabel = (entry: PartLibraryEntry) =>
    [
      entry.name || t('profile.avatar.part.untitled'),
      entry.origins
        .map((origin) => t(`profile.avatar.part.origin.${ORIGIN_KEYS[origin]}`))
        .join(', '),
      ...(entry.author ? [t('profile.avatar.part.byAuthor', { author: entry.author })] : []),
      ...(entry.parentAuthor
        ? [t('profile.avatar.part.basedOn', { author: entry.parentAuthor })]
        : []),
    ].join(' · ');
  const partEditor = () =>
    drawing ? (
      <CustomPartEditor
        key={`${drawing.slot}:${drawing.parent ?? 'new'}`}
        slot={drawing.slot}
        note={drawing.note}
        backdrop={drawing.backdrop}
        recipe={drawing.base}
        initial={drawing.initial}
        onChange={(part) => update(withAvatarCustomPart(drawing.base, drawing.slot, part))}
        onSave={async (part, name) => {
          const entry = await library?.add(part, name, drawing.parent);
          if (!entry) return false;
          setParts((current) => [entry, ...(current ?? []).filter((item) => item.id !== entry.id)]);
          update(withAvatarCustomPart(drawing.base, drawing.slot, entry.part));
          setDrawing(undefined);
          return true;
        }}
        onCancel={() => {
          update(drawing.restore);
          setDrawing(undefined);
        }}
        t={t}
      />
    ) : null;
  const partActions = (slot: PartSlot, recipe: IllustratedAvatarRecipe) => {
    const worn = wornAvatarPart(recipe, slot);
    const hair = isHairPartSlot(slot) || isReplacePartSlot(slot);
    const own = (parts ?? []).filter(
      (entry) =>
        entry.part.slot === slot &&
        (originFilter === 'all' || entry.origins.includes(originFilter)),
    );
    const importFiles = async (files: File[] | null) => {
      const file = files?.[0];
      if (!file || !library?.importParts) return;
      if (file.size > MAX_IMPORT_BYTES) {
        setLibraryNote(t('profile.avatar.part.importTooLarge'));
        return;
      }
      let data: string;
      try {
        data = await readBase64(file);
      } catch {
        setLibraryNote(t('profile.avatar.part.importTooLarge'));
        return;
      }
      const result = await library.importParts(data);
      if ('error' in result) {
        setLibraryNote(result.error);
        return;
      }
      if (result.image) {
        const slots = result.image.slots.filter((value): value is PartSlot =>
          Object.hasOwn(SLOT_CATEGORY, value),
        );
        setLibraryNote(undefined);
        setPendingImage({
          data,
          name: file.name.replace(/\.png$/iu, '').slice(0, 60),
          width: result.image.width,
          height: result.image.height,
          colors: result.image.colors,
          slots,
          slot: slots.includes(slot) ? slot : slots[0]!,
          keep: Math.min(result.image.colors, MAX_IMAGE_KEEP),
        });
        return;
      }
      setParts((current) => [
        ...result.added,
        ...(current ?? []).filter((item) => !result.added.some((added) => added.id === item.id)),
      ]);
      setLibraryNote(
        t(result.refused ? 'profile.avatar.part.importedRefused' : 'profile.avatar.part.imported', {
          count: result.added.length,
          refused: result.refused,
        }),
      );
    };
    const exportParts = async (part?: PixelCustomPart) => {
      const file = await library?.exportParts?.(part ? customPartId(part) : undefined, part);
      if (file) download(file.fileName, file.data, part ? 'image/png' : 'application/zip');
      else setLibraryNote(t('profile.avatar.part.exportFailed'));
    };
    const builtInHead = slot === 'headpiece' ? builtInAvatarHeadpiece(recipe) : undefined;
    const acceptImage = async (pending: PendingImage) => {
      if (!library?.importImage) return;
      const result = await library.importImage(
        pending.data,
        pending.slot,
        pending.keep,
        pending.name,
      );
      if ('error' in result) {
        setLibraryNote(result.error);
        return;
      }
      setPendingImage(undefined);
      setParts((current) => [result, ...(current ?? []).filter((item) => item.id !== result.id)]);
      if (result.part.slot === slot) update(withAvatarCustomPart(recipe, slot, result.part));
      setLibraryNote(t('profile.avatar.part.imported', { count: 1, refused: 0 }));
    };
    const draw = () =>
      setDrawing(
        builtInHead && !worn
          ? {
              slot,
              base: recipe,
              restore: recipe,
              backdrop: withAvatarCustomPart(recipe, slot, undefined) as IllustratedAvatarRecipe,
              initial: headpieceStart(recipe),
              note: t('profile.avatar.part.flattenPartNote'),
            }
          : hair
            ? {
                slot,
                base: withAvatarCustomPart(recipe, slot, undefined),
                restore: recipe,
                backdrop: withAvatarCustomPart(recipe, slot, {
                  slot,
                  front: [],
                  back: [],
                }) as IllustratedAvatarRecipe,
                initial: isHairPartSlot(slot)
                  ? hairPieceStart(recipe, slot)
                  : replacePartStart(recipe, slot as Parameters<typeof replacePartStart>[1]),
                ...(worn
                  ? { parent: customPartId(worn) }
                  : {
                      note: t(
                        isHairPartSlot(slot)
                          ? 'profile.avatar.part.flattenNote'
                          : 'profile.avatar.part.flattenPartNote',
                      ),
                    }),
              }
            : { slot, base: recipe, restore: recipe },
      );
    return (
      <>
        <div className="bh-part-library-actions">
          <button
            type="button"
            className="bh-avatar-color-reset"
            data-part-draw={slot}
            onClick={draw}
          >
            {t(hair ? 'profile.avatar.part.drawPiece' : 'profile.avatar.part.draw')}
          </button>
          {worn && !hair ? (
            <button
              type="button"
              className="bh-avatar-color-reset"
              data-part-edit={slot}
              onClick={() =>
                setDrawing({
                  slot,
                  base: recipe,
                  restore: recipe,
                  initial: worn,
                  parent: customPartId(worn),
                })
              }
            >
              {t('profile.avatar.part.edit')}
            </button>
          ) : null}
          {worn && hair ? (
            <button
              type="button"
              className="bh-avatar-color-reset"
              data-part-remove={slot}
              onClick={() => update(withAvatarCustomPart(recipe, slot, undefined))}
            >
              {t('profile.avatar.part.removePiece')}
            </button>
          ) : null}
          {worn && library?.exportParts ? (
            <button
              type="button"
              className="bh-avatar-color-reset"
              data-part-export={slot}
              onClick={() => void exportParts(worn)}
            >
              {t('profile.avatar.part.exportPart')}
            </button>
          ) : null}
        </div>
        {library?.importParts || library?.exportParts ? (
          <div className="bh-part-library-actions" data-part-library-tools>
            <select
              aria-label={t('profile.avatar.part.originFilter')}
              data-part-origin-filter
              value={originFilter}
              onChange={(event) => setOriginFilter(event.currentTarget.value as OriginFilter)}
            >
              {ORIGIN_FILTERS.map((value) => (
                <option key={value} value={value}>
                  {value === 'all'
                    ? t('profile.avatar.part.originAll')
                    : t(`profile.avatar.part.origin.${originKey(value)}`)}
                </option>
              ))}
            </select>
            {library.importParts ? (
              <label className="bh-avatar-color-reset" data-part-import>
                {t('profile.avatar.part.import')}
                <input
                  type="file"
                  accept=".png,.zip,image/png,application/zip"
                  hidden
                  onChange={(event) => {
                    const files = event.currentTarget.files;
                    void importFiles(files ? [...files] : null).finally(() => {
                      event.target.value = '';
                    });
                  }}
                />
              </label>
            ) : null}
            {library.exportParts ? (
              <button
                type="button"
                className="bh-avatar-color-reset"
                data-part-export-library
                onClick={() => void exportParts()}
              >
                {t('profile.avatar.part.exportLibrary')}
              </button>
            ) : null}
            {libraryNote ? (
              <span className="bh-avatar-hidden-note" role="status" data-part-library-note>
                {libraryNote}
              </span>
            ) : null}
          </div>
        ) : null}
        {pendingImage ? (
          <div className="bh-part-image" data-part-image role="group">
            <p>
              {t('profile.avatar.part.imageInfo', {
                width: pendingImage.width,
                height: pendingImage.height,
                colors: pendingImage.colors,
              })}
            </p>
            {pendingImage.slots.length > 1 ? (
              <label>
                <span>{t('profile.avatar.part.imageSlot')}</span>
                <select
                  data-part-image-slot
                  value={pendingImage.slot}
                  onChange={(event) =>
                    setPendingImage({
                      ...pendingImage,
                      slot: event.currentTarget.value as PartSlot,
                    })
                  }
                >
                  {pendingImage.slots.map((value) => (
                    <option key={value} value={value}>
                      {t(`profile.avatar.${SLOT_CATEGORY[value]}` as Key)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              <span>{t('profile.avatar.part.imageKeep')}</span>
              <input
                type="number"
                data-part-image-keep
                min={1}
                max={Math.min(pendingImage.colors, MAX_IMAGE_KEEP)}
                value={pendingImage.keep}
                onChange={(event) =>
                  setPendingImage({
                    ...pendingImage,
                    keep: Math.max(
                      1,
                      Math.min(
                        Math.min(pendingImage.colors, MAX_IMAGE_KEEP),
                        Math.round(Number(event.currentTarget.value)) || 1,
                      ),
                    ),
                  })
                }
              />
            </label>
            {pendingImage.colors > MAX_IMAGE_KEEP ? (
              <p className="bh-avatar-hidden-note" data-part-image-reduce>
                {t('profile.avatar.part.imageReduce', { max: MAX_IMAGE_KEEP })}
              </p>
            ) : null}
            <p className="bh-avatar-hidden-note">{t('profile.avatar.part.imageRemap')}</p>
            <div className="bh-part-library-actions">
              <button
                type="button"
                className="bh-avatar-color-reset"
                data-part-image-accept
                onClick={() => void acceptImage(pendingImage)}
              >
                {t('profile.avatar.part.imageAccept')}
              </button>
              <button
                type="button"
                className="bh-avatar-color-reset"
                data-part-image-cancel
                onClick={() => setPendingImage(undefined)}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : null}
        {hair ? null : (
          <OptionTile
            id={`${slot}:none`}
            recipe={withAvatarCustomPart(recipe, slot, undefined)}
            selected={!worn && builtInAvatarHeadpiece(recipe) === undefined}
            label={t('profile.avatar.part.none')}
            onSelect={() => update(withAvatarCustomPart(recipe, slot, undefined))}
          />
        )}
        {own.map((entry) => (
          <OptionTile
            key={entry.id}
            id={`${slot}:${entry.id}`}
            recipe={withAvatarCustomPart(recipe, slot, entry.part)}
            selected={worn !== undefined && customPartId(worn) === entry.id}
            label={originLabel(entry)}
            onSelect={() => update(withAvatarCustomPart(recipe, slot, entry.part))}
          />
        ))}
        {!hair && parts !== undefined && own.length === 0 ? (
          <p className="bh-avatar-hidden-note">{t('profile.avatar.part.libraryEmpty')}</p>
        ) : null}
      </>
    );
  };
  return (
    <section aria-label={t('profile.avatar.section')}>
      <div className="bh-avatar-editor">
        <div data-avatar-preview-column {...stylex.props(editorStyles.previewColumn)}>
          <div
            className={joinClass(
              'bh-avatar-editor-preview',
              stylex.props(avatarFrameStyles.preview).className,
            )}
            data-avatar-preview
          >
            <PersonaBotAvatar
              preview={editing}
              personaBotId={bot.slug}
              name={bot.displayName}
              src={editing ? image : bot.avatar}
              appearance={
                recipe
                  ? {
                      recipe,
                      revision: bot.appearance?.revision ?? '0'.repeat(64),
                    }
                  : undefined
              }
              avatarSeed={bot.avatarSeed}
              size={160}
              squareBackdrop
              state={state}
              activity={bot.activity}
              attention={bot.attention}
              indicator={false}
              t={t}
            />
          </div>
          {draft === undefined && onUpload ? (
            <Button
              data-avatar-upload
              type="button"
              size="sm"
              variant="outline"
              icon={<Icon name="image-up" />}
              xstyle={editorStyles.fullAction}
              disabled={saving}
              onClick={onUpload}
            >
              {t('profile.avatar.uploadTitle')}
            </Button>
          ) : null}
          {draft === undefined && bot.avatar !== undefined && onRemoveImage ? (
            <div {...stylex.props(editorStyles.remove)}>
              <ActionButton
                data-avatar-remove
                tone="danger"
                icon="x"
                disabled={saving}
                onClick={onRemoveImage}
              >
                {t('profile.avatar.remove')}
              </ActionButton>
            </div>
          ) : null}
        </div>
        <div className="bh-avatar-editor-controls">
          {draft ? (
            <>
              <h3 className="bh-avatar-editor-title">
                <span>{t('profile.avatar.designTitle')}</span>
                <PersonaBotStatusBadges state={state} attention={bot.attention} t={t} />
              </h3>
              <p>{t('profile.avatar.designDescription')}</p>
            </>
          ) : (
            <AvatarPresetPicker
              selected={preset}
              pixelPresets={bot.appearanceUnsupported ? [] : getPixelPresets()}
              hasTilties={onChooseImage !== undefined}
              pixelDisabled={bot.appearanceUnsupported === true}
              disabled={saving}
              onChoose={(choice) => {
                setPreset(choice);
                setFailed(false);
              }}
              onCustomize={start}
              t={t}
            />
          )}
          {draft && fields ? (
            <fieldset disabled={busy} className="bh-avatar-editor-fields">
              <div
                className="bh-avatar-families"
                role="radiogroup"
                aria-label={t('profile.avatar.family')}
              >
                {AVATAR_FAMILIES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    data-avatar-family={value}
                    aria-checked={family === value}
                    onClick={() => choose(value)}
                  >
                    {t(`profile.avatar.family.${value}`)}
                  </button>
                ))}
              </div>
              <div className="bh-avatar-categories">
                <div role="tablist" aria-label={t('profile.avatar.parts')}>
                  {categoriesFor(spec, draft, library !== undefined).map((key) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      id={`bh-avatar-tab-${key}`}
                      data-avatar-category={key}
                      aria-selected={category === key}
                      aria-controls="bh-avatar-panel"
                      tabIndex={category === key ? 0 : -1}
                      onClick={() => {
                        setCategory(key);
                        if (PART_CATEGORY[key] && parts === undefined && library)
                          void library.load().then((loaded) => {
                            if (loaded) setParts(loaded);
                          });
                      }}
                      onKeyDown={(event) => {
                        const step =
                          event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                        if (!step) return;
                        event.preventDefault();
                        const list = categoriesFor(spec, draft, library !== undefined);
                        const next = list[(list.indexOf(key) + step + list.length) % list.length]!;
                        setCategory(next);
                        event.currentTarget.parentElement
                          ?.querySelector<HTMLButtonElement>(`[data-avatar-category="${next}"]`)
                          ?.focus();
                      }}
                    >
                      {t(`profile.avatar.${key}` as Key)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  data-avatar-shuffle
                  className="bh-avatar-shuffle"
                  onClick={() => update(shuffled(draft))}
                >
                  {t('profile.avatar.shuffle')}
                </button>
              </div>
              {category === 'colors' ? (
                <div
                  className="bh-avatar-colors"
                  role="tabpanel"
                  id="bh-avatar-panel"
                  aria-labelledby="bh-avatar-tab-colors"
                >
                  {spec.colors.map((key) => (
                    <div key={key} className="bh-avatar-color-row">
                      <span>{t(`profile.avatar.${key}` as Key)}</span>
                      {swatchesFor(spec, fields, key).map((value) => (
                        <button
                          key={value}
                          type="button"
                          className="bh-avatar-swatch"
                          data-avatar-option={`${key}:${value}`}
                          aria-pressed={fields[key] === value}
                          aria-label={`${t(`profile.avatar.${key}` as Key)} ${value}`}
                          style={{ background: value }}
                          onClick={() => set(key, value)}
                        />
                      ))}
                      <input
                        name={key}
                        type="color"
                        aria-label={t(`profile.avatar.${key}` as Key)}
                        value={String(fields[key] ?? fields['hairColor'])}
                        onChange={(event) => set(key, event.currentTarget.value)}
                      />
                      {fields[key] !== undefined &&
                      (PIECE_COLORS as readonly string[]).includes(key) ? (
                        <button
                          type="button"
                          className="bh-avatar-color-reset"
                          data-avatar-color-reset={key}
                          onClick={() => {
                            const { [key]: _removed, ...rest } = draft as unknown as Fields;
                            update(rest as unknown as AvatarRecipe);
                          }}
                        >
                          {t('profile.avatar.followHairColor')}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : category === 'headpiece' && draft.family === 'illustrated' ? (
                <div
                  className="bh-avatar-options"
                  role="tabpanel"
                  id="bh-avatar-panel"
                  aria-labelledby="bh-avatar-tab-headpiece"
                >
                  {hiddenFor(draft, 'headpiece') ? (
                    <p className="bh-avatar-hidden-note" data-avatar-hidden-note="headpiece">
                      {t('profile.avatar.hiddenNote')}
                    </p>
                  ) : null}
                  {drawing?.slot === 'headpiece' ? (
                    partEditor()
                  ) : (
                    <>
                      {library ? (
                        partActions('headpiece', draft)
                      ) : (
                        <OptionTile
                          id="headpiece:none"
                          recipe={withAvatarBuiltInHeadpiece(draft, undefined)}
                          selected={builtInAvatarHeadpiece(draft) === undefined}
                          label={t('profile.avatar.part.none')}
                          onSelect={() => update(withAvatarBuiltInHeadpiece(draft, undefined))}
                        />
                      )}
                      {AVATAR_HEADPIECES.map((value) => (
                        <OptionTile
                          key={value}
                          id={`headpiece:${value}`}
                          recipe={withAvatarBuiltInHeadpiece(draft, value)}
                          selected={builtInAvatarHeadpiece(draft) === value}
                          label={t(`profile.avatar.option.headpiece.${value}` as Key)}
                          onSelect={() => update(withAvatarBuiltInHeadpiece(draft, value))}
                        />
                      ))}
                    </>
                  )}
                </div>
              ) : category === 'presets' ? (
                <div
                  className="bh-avatar-options"
                  role="tabpanel"
                  id="bh-avatar-panel"
                  aria-labelledby="bh-avatar-tab-presets"
                >
                  {spec.presets.map((preset, index) => (
                    <OptionTile
                      key={index}
                      id={`preset:${index}`}
                      recipe={preset}
                      selected={JSON.stringify(preset) === JSON.stringify(draft)}
                      label={`${t('profile.avatar.presets')} ${index + 1}`}
                      onSelect={() => update({ ...preset })}
                    />
                  ))}
                </div>
              ) : category === 'shape' ? (
                <div
                  className="bh-avatar-ranges"
                  role="tabpanel"
                  id="bh-avatar-panel"
                  aria-labelledby="bh-avatar-tab-shape"
                >
                  {Object.entries(spec.ranges).map(([key, [min, max]]) => (
                    <label key={key}>
                      <span>{t(`profile.avatar.${key}` as Key)}</span>
                      <input
                        type="range"
                        name={key}
                        min={min}
                        max={max}
                        step={1}
                        value={Number(fields[key])}
                        onChange={(event) => set(key, Number(event.currentTarget.value))}
                      />
                      <output>{fields[key]}</output>
                    </label>
                  ))}
                </div>
              ) : (
                <div
                  className="bh-avatar-options"
                  role="tabpanel"
                  id="bh-avatar-panel"
                  aria-labelledby={`bh-avatar-tab-${category}`}
                >
                  {hiddenFor(draft, category) ? (
                    <p className="bh-avatar-hidden-note" data-avatar-hidden-note={category}>
                      {t('profile.avatar.hiddenNote')}
                    </p>
                  ) : null}
                  {pieceSlot && drawing?.slot === pieceSlot ? partEditor() : null}
                  {pieceSlot && drawing?.slot !== pieceSlot && draft.family === 'illustrated'
                    ? partActions(pieceSlot, draft)
                    : null}
                  {(drawing && pieceSlot && drawing.slot === pieceSlot
                    ? []
                    : (spec.parts[category] ?? []).filter(
                        (value) =>
                          !(
                            category === 'accessory' &&
                            draft.family === 'illustrated' &&
                            draft.assetVersion === 4 &&
                            MOVED.has(value) &&
                            fields[category] !== value
                          ),
                      )
                  ).map((value) => (
                    <OptionTile
                      key={value}
                      id={`${category}:${value}`}
                      recipe={builtIn(category, value)}
                      selected={(fields[category] ?? 'none') === value && !pieceWorn}
                      label={t(spec.option(category, value))}
                      onSelect={() => update(builtIn(category, value))}
                    />
                  ))}
                </div>
              )}
            </fieldset>
          ) : null}
          {editing ? (
            <div
              className={joinClass(
                'bh-profile-avatar-actions',
                stylex.props(editorStyles.actions).className,
              )}
            >
              <Button
                size="sm"
                variant="primary"
                icon={<Icon name="save" />}
                data-avatar-save
                type="button"
                disabled={saving || drawing !== undefined}
                onClick={() => void save()}
              >
                {t('profile.save')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Icon name="x" />}
                data-avatar-cancel
                type="button"
                disabled={saving}
                onClick={() => {
                  if (draft) {
                    setDrafts(undefined);
                    setDrawing(undefined);
                  } else {
                    setPreset(undefined);
                  }
                  setFailed(false);
                }}
              >
                {t('common.cancel')}
              </Button>
            </div>
          ) : null}
          {failed ? (
            <p role="alert" className="bh-error">
              {t('profile.avatar.failed')}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
