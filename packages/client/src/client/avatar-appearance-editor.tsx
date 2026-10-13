import { useMemo, useState, type ReactElement } from 'react';
import {
  AVATAR_COLORS,
  AVATAR_FAMILIES,
  AVATAR_EXTRA_PARTS,
  AVATAR_HAIR_PARTS,
  AVATAR_PARTS,
  AVATAR_PARTS_V2,
  AVATAR_PIECE_COLORS,
  AVATAR_PIECE_COLORS_V4,
  AVATAR_HEADPIECES,
  AVATAR_ANIMAL_SPECIES,
  AVATAR_PATTERNS,
  isAnimalSpecies,
  AVATAR_STRANDS,
  withAvatarPieces,
  withAvatarBuiltInHeadpiece,
  builtInAvatarHeadpiece,
  AVATAR_PRESETS,
  AVATAR_RANGES,
  AVATAR_SPECIES,
  AVATAR_SPECIES_SWATCHES,
  detailedAvatarRecipe,
  hiddenAvatarChoices,
  type IllustratedAvatarRecipe,
  AVATAR_SWATCHES,
  withAvatarSpecies,
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
  avatarSvg,
  seededAvatarFor,
  type AvatarFamily,
  type AvatarRecipe,
} from '../../../core/src/bots/avatar-appearance.js';
import {
  LINE_COLORS,
  LINE_PARTS,
  LINE_PRESETS,
  LINE_RANGES,
  LINE_SWATCHES,
  seededLineRecipe,
} from '../../../core/src/bots/avatar-line.js';
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import type { PartLibraryEntry } from '../../../core/src/bots/part-library.js';
import { CustomPartEditor } from './custom-part-editor.js';
import { PersonaBotAvatar, PersonaBotStatusBadges, normalizePersonaBotActivity } from './avatar.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import type { BotSummary } from './store.js';
import type { BotHarnessTranslate } from './locale.js';

type Key = Parameters<BotHarnessTranslate>[0];

interface FamilySpec {
  parts: Readonly<Record<string, readonly string[]>>;
  colors: readonly string[];
  swatches: Readonly<Record<string, readonly string[]>>;
  ranges: Readonly<Record<string, readonly [number, number]>>;
  categories: readonly string[];
  presets: readonly AvatarRecipe[];
  option(part: string, value: string): Key;
  seeded(name: string, seed: 2 | undefined): AvatarRecipe;
}

const PIECE_COLORS = [
  'bangsColor',
  ...AVATAR_PIECE_COLORS,
  'backHairColor',
  'strandColor',
] as const satisfies readonly string[];
const V4_KEYS = new Set<string>(['strand', 'pattern', ...AVATAR_PIECE_COLORS_V4]);
const MOVED = new Set<string>(AVATAR_HEADPIECES);

const FAMILIES: Record<AvatarFamily, FamilySpec> = {
  illustrated: {
    parts: {
      species: [...AVATAR_SPECIES, ...AVATAR_ANIMAL_SPECIES],
      pattern: AVATAR_PATTERNS,
      ...AVATAR_PARTS_V2,
      ...AVATAR_HAIR_PARTS,
      rightSideHair: AVATAR_HAIR_PARTS.sideHair,
      beard: ['none', ...AVATAR_EXTRA_PARTS.beard],
      petals: AVATAR_EXTRA_PARTS.petals,
      flowerBase: AVATAR_EXTRA_PARTS.flowerBase,
      strand: ['none', ...AVATAR_STRANDS],
    },
    colors: [...AVATAR_COLORS, ...PIECE_COLORS],
    swatches: {
      ...AVATAR_SWATCHES,
      ...Object.fromEntries(PIECE_COLORS.map((key) => [key, AVATAR_SWATCHES.hairColor])),
    },
    ranges: AVATAR_RANGES,
    presets: AVATAR_PRESETS,
    categories: [
      'presets',
      'species',
      'pattern',
      'hair',
      'bangs',
      'sideHair',
      'rightSideHair',
      'backHair',
      'strand',
      'petals',
      'flowerBase',
      ...Object.keys(AVATAR_PARTS).filter((part) => part !== 'backdrop' && part !== 'hair'),
      'beard',
      'headpiece',
      'shape',
      'colors',
    ],
    option: (part, value) =>
      `profile.avatar.option.${part === 'rightSideHair' ? 'sideHair' : part}.${value}` as Key,
    seeded: seededAvatarFor,
  },
  line: {
    parts: LINE_PARTS,
    colors: LINE_COLORS,
    swatches: LINE_SWATCHES,
    ranges: LINE_RANGES,
    presets: LINE_PRESETS,
    categories: [
      'presets',
      ...Object.keys(LINE_PARTS).filter((part) => part !== 'symbol'),
      'shape',
      'colors',
    ],
    option: (part, value) => `profile.avatar.line.${part}.${value}` as Key,
    seeded: seededLineRecipe,
  },
};

type Fields = Record<string, string | number>;

const DETAIL = new Set<string>([...Object.keys(AVATAR_HAIR_PARTS), ...Object.keys(AVATAR_RANGES)]);
const EXTRAS = new Set<string>(Object.keys(AVATAR_EXTRA_PARTS));
const SPLIT = new Set<string>([
  'species',
  'sideHair',
  'rightSideHair',
  ...AVATAR_PIECE_COLORS,
  ...EXTRAS,
]);
const PART_CATEGORY: Partial<Record<string, PartSlot>> = {
  headpiece: 'headpiece',
  pattern: 'pattern',
  bangs: 'bangs',
  sideHair: 'leftSideHair',
  rightSideHair: 'rightSideHair',
  backHair: 'backHair',
  outfit: 'outfit',
  accessory: 'accessory',
  beard: 'beard',
  glasses: 'glasses',
  nose: 'nose',
  cheeks: 'cheeks',
  petals: 'petals',
  flowerBase: 'flowerBase',
};
const V2_ONLY = (part: string, value: string | number) =>
  (part === 'outfit' || part === 'accessory') &&
  !(AVATAR_PARTS[part] as readonly (string | number)[]).includes(value);

function withPart(recipe: AvatarRecipe, key: string, value: string | number): AvatarRecipe {
  if (recipe.family !== 'illustrated')
    return { ...(recipe as unknown as Fields), [key]: value } as unknown as AvatarRecipe;
  if (key === 'species')
    return withAvatarSpecies(recipe, value as Parameters<typeof withAvatarSpecies>[1]);
  if (V4_KEYS.has(key)) {
    const { [key]: _removed, ...rest } = withAvatarPieces(recipe) as unknown as Fields;
    return (value === 'none' ? rest : { ...rest, [key]: value }) as unknown as AvatarRecipe;
  }
  if (EXTRAS.has(key) && value === 'none') {
    const { [key]: _removed, ...rest } = recipe as unknown as Fields;
    return rest as unknown as AvatarRecipe;
  }
  if (SPLIT.has(key) || V2_ONLY(key, value))
    return {
      ...withAvatarSpecies(recipe, recipe.species ?? 'human'),
      [key]: value,
    } as IllustratedAvatarRecipe;
  if (DETAIL.has(key))
    return {
      ...(detailedAvatarRecipe(recipe) as unknown as Fields),
      [key]: value,
    } as unknown as AvatarRecipe;
  const next = { ...recipe, [key]: value } as IllustratedAvatarRecipe;
  if (key !== 'hair' || recipe.bangs === undefined) return next;
  const { bangs: _b, sideHair: _s, backHair: _h, ...plain } = next;
  const split = detailedAvatarRecipe(plain as unknown as IllustratedAvatarRecipe);
  return {
    ...split,
    ...(split.assetVersion === 2
      ? { rightSideHair: split.sideHair as NonNullable<IllustratedAvatarRecipe['rightSideHair']> }
      : {}),
    spacing: next.spacing ?? 0,
    height: next.height ?? 0,
    hairLength: next.hairLength ?? 0,
  } as IllustratedAvatarRecipe;
}

function shuffled(recipe: AvatarRecipe): AvatarRecipe {
  const spec = FAMILIES[recipe.family];
  const pick = <T,>(values: readonly T[]) => values[Math.floor(Math.random() * values.length)]!;
  const next: Fields = { ...(recipe as unknown as Fields) };
  const own = (key: string) =>
    recipe.family !== 'illustrated' || (!SPLIT.has(key) && !V4_KEYS.has(key));
  for (const [part, values] of Object.entries(spec.parts)) if (own(part)) next[part] = pick(values);
  for (const color of spec.colors) if (own(color)) next[color] = pick(spec.swatches[color]!);
  for (const [key, [min, max]] of Object.entries(spec.ranges))
    next[key] = min + Math.floor(Math.random() * (max - min + 1));
  if (recipe.family !== 'illustrated') return next as unknown as AvatarRecipe;
  const species = pick(AVATAR_SPECIES);
  const random = withAvatarSpecies(next as unknown as IllustratedAvatarRecipe, species);
  for (const color of AVATAR_PIECE_COLORS) delete random[color];
  for (const key of V4_KEYS) delete random[key as keyof typeof random];
  for (const extra of EXTRAS) delete random[extra as keyof typeof random];
  const beard = pick(['none', ...AVATAR_EXTRA_PARTS.beard] as const);
  return {
    ...random,
    sideHair: pick(AVATAR_HAIR_PARTS.sideHair),
    rightSideHair: pick(AVATAR_HAIR_PARTS.sideHair),
    skinColor: pick(AVATAR_SPECIES_SWATCHES[species]),
    ...(species === 'flower'
      ? {
          petals: pick(AVATAR_EXTRA_PARTS.petals),
          flowerBase: pick(AVATAR_EXTRA_PARTS.flowerBase),
        }
      : beard === 'none'
        ? {}
        : { beard }),
  } as IllustratedAvatarRecipe;
}

function categoriesFor(
  spec: FamilySpec,
  recipe: AvatarRecipe | undefined,
  library = true,
): readonly string[] {
  if (recipe?.family !== 'illustrated') return spec.categories;
  const flower = recipe.species === 'flower';
  return spec.categories.filter((key) =>
    key === 'petals' || key === 'flowerBase'
      ? flower
      : key === 'beard'
        ? !flower
        : key === 'strand'
          ? !flower
          : key === 'pattern'
            ? isAnimalSpecies(recipe.species)
            : true,
  );
}

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
        image?: { width: number; height: number; colors: number; slots: string[] };
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
const SLOT_CATEGORY = Object.fromEntries(
  Object.entries(PART_CATEGORY).map(([category, slot]) => [slot, category]),
) as Record<PartSlot, string>;
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

function hiddenFor(recipe: AvatarRecipe | undefined, category: string): boolean {
  if (recipe?.family !== 'illustrated') return false;
  const hidden = hiddenAvatarChoices(recipe);
  return hidden.includes(category) || (category === 'hair' && hidden.includes('bangs'));
}

function swatchesFor(spec: FamilySpec, fields: Fields, key: string): readonly string[] {
  if (key !== 'skinColor' || fields['family'] !== 'illustrated') return spec.swatches[key]!;
  const species = (fields['species'] ?? 'human') as keyof typeof AVATAR_SPECIES_SWATCHES;
  return AVATAR_SPECIES_SWATCHES[species];
}

function OptionTile({
  recipe,
  selected,
  label,
  id,
  onSelect,
}: {
  recipe: AvatarRecipe;
  selected: boolean;
  label: string;
  id: string;
  onSelect(): void;
}): ReactElement {
  const key = JSON.stringify(recipe);
  const markup = useMemo(() => avatarSvg(JSON.parse(key) as AvatarRecipe), [key]);
  return (
    <button
      type="button"
      className="bh-avatar-option"
      data-avatar-option={id}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      onClick={onSelect}
    >
      <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />
    </button>
  );
}

export function AvatarAppearanceEditor({
  bot,
  channelId,
  onSave,
  onUpload,
  onRemoveImage,
  imageBusy = false,
  library,
  t,
}: {
  bot: BotSummary;
  channelId: string;
  onSave(channelId: string, recipe: AvatarRecipe): Promise<boolean>;
  onUpload?: (() => void) | undefined;
  onRemoveImage?: (() => void) | undefined;
  imageBusy?: boolean | undefined;
  library?: PartLibraryActions | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
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
    const saved = bot.appearance?.recipe ?? seededAvatarFor(seed, bot.avatarSeed);
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
  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    const saved = await onSave(channelId, draft);
    setBusy(false);
    setFailed(!saved);
    if (saved) setDrafts(undefined);
  };
  const state = normalizePersonaBotActivity(bot.aggregateState);
  const recipe = draft ?? bot.appearance?.recipe;
  const fields = (draft?.family === 'illustrated'
    ? detailedAvatarRecipe(draft)
    : draft) as unknown as Fields | undefined;
  const set = (key: string, value: string | number) => {
    if (draft) update(withPart(draft, key, value));
  };
  const current = bot.avatar !== undefined && bot.appearance === undefined ? 'image' : 'design';
  const inUse = <Tag tone="success">{t('profile.avatar.current')}</Tag>;
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
        <div className="bh-avatar-editor-preview" data-avatar-preview>
          <PersonaBotAvatar
            personaBotId={bot.slug}
            name={bot.displayName}
            src={bot.avatar}
            appearance={
              recipe ? { recipe, revision: bot.appearance?.revision ?? '0'.repeat(64) } : undefined
            }
            avatarSeed={bot.avatarSeed}
            size={160}
            state={state}
            activity={bot.activity}
            attention={bot.attention}
            indicator={false}
            t={t}
          />
        </div>
        <div className="bh-avatar-editor-controls">
          {draft ? (
            <>
              <h3 className="bh-avatar-editor-title">
                <span>{t('profile.avatar.designTitle')}</span>
                <PersonaBotStatusBadges state={state} attention={bot.attention} />
              </h3>
              <p>{t('profile.avatar.designDescription')}</p>
            </>
          ) : (
            <>
              {bot.appearanceUnsupported ? (
                <p className="bh-avatar-unsupported" data-avatar-unsupported role="note">
                  {t('profile.avatar.unsupported')}
                </p>
              ) : null}
              <SidebarCardList className="bh-avatar-methods" label={t('profile.avatar.section')}>
                <SidebarCardRow
                  icon="palette"
                  title={t('profile.avatar.designTitle')}
                  chips={current === 'design' ? inUse : undefined}
                  meta={t('profile.avatar.designDescription')}
                  state={current === 'design' ? 'current' : undefined}
                  detail={
                    <div className="bh-profile-avatar-actions">
                      <button
                        data-avatar-edit
                        type="button"
                        className="bh-profile-action"
                        disabled={bot.appearanceUnsupported === true}
                        onClick={start}
                      >
                        {t('profile.avatar.design')}
                      </button>
                    </div>
                  }
                />
                {onUpload === undefined ? null : (
                  <SidebarCardRow
                    icon="image-up"
                    title={t('profile.avatar.uploadTitle')}
                    chips={current === 'image' ? inUse : undefined}
                    meta={t('profile.avatar.uploadDescription')}
                    state={current === 'image' ? 'current' : undefined}
                    detail={
                      <div className="bh-profile-avatar-actions">
                        <button
                          data-avatar-upload
                          type="button"
                          className="bh-profile-action"
                          disabled={imageBusy}
                          onClick={onUpload}
                        >
                          {t('profile.avatar.upload')}
                        </button>
                        {bot.avatar === undefined || onRemoveImage === undefined ? null : (
                          <button
                            data-avatar-remove
                            type="button"
                            className="bh-profile-action"
                            disabled={imageBusy}
                            onClick={onRemoveImage}
                          >
                            {t('profile.avatar.remove')}
                          </button>
                        )}
                      </div>
                    }
                  />
                )}
              </SidebarCardList>
            </>
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
          {draft ? (
            <div className="bh-profile-avatar-actions">
              <button
                data-avatar-save
                type="button"
                className="bh-profile-action bh-profile-action-primary"
                disabled={busy || drawing !== undefined}
                onClick={() => void save()}
              >
                {t('profile.save')}
              </button>
              <button
                data-avatar-cancel
                type="button"
                className="bh-profile-action"
                disabled={busy}
                onClick={() => {
                  setDrafts(undefined);
                  setDrawing(undefined);
                  setFailed(false);
                }}
              >
                {t('common.cancel')}
              </button>
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
