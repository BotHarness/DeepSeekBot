import {
  attachOperationalModule,
  type OperationalDatabaseModulePort,
  type OperationalDatabaseOwner,
} from '../database/owner.js';
import type { PersonaBotRegistryOptions } from './registry.js';
import {
  canonicalCustomPart,
  customPartId,
  isPixelCustomPart,
  isAvatarAppearance,
  PART_SLOTS,
  wornAvatarPart,
  type PartSlot,
  type PixelCustomPart,
} from './avatar-appearance.js';

export const PART_ORIGINS = [
  'drawn',
  'derived',
  'imported-bot',
  'imported-file',
  'imported-image',
] as const;
export type PartOrigin = (typeof PART_ORIGINS)[number];
export const MAX_PART_NAME = 60;

export function createHostAvatarParts(operationalDatabase: OperationalDatabaseOwner) {
  const partLibrary = createPartLibrary({
    database: attachOperationalModule(operationalDatabase, 'avatar-part-library'),
  });
  const onAppearanceImported: NonNullable<PersonaBotRegistryOptions['onAppearanceImported']> = (
    record,
  ) => {
    const recipe = isAvatarAppearance(record.appearance) ? record.appearance.recipe : undefined;
    if (recipe?.family !== 'illustrated') return;
    for (const slot of Object.keys(PART_SLOTS) as PartSlot[]) {
      const part = wornAvatarPart(recipe, slot);
      if (part)
        partLibrary.add({ part, name: '', origin: 'imported-bot', author: record.displayName });
    }
  };
  return { partLibrary, onAppearanceImported };
}

export interface PartLibraryEntry {
  id: string;
  part: PixelCustomPart;
  name: string;
  origins: PartOrigin[];
  parent?: string;
  author?: string;
  parentAuthor?: string;
  addedAt: string;
}

export interface PartLibraryInput {
  part: PixelCustomPart;
  name: string;
  origin: PartOrigin;
  parent?: string | undefined;
  author?: string | undefined;
  parentAuthor?: string | undefined;
}

export interface PartLibrary {
  list(): PartLibraryEntry[];
  get(id: string): PartLibraryEntry | undefined;
  add(input: PartLibraryInput): PartLibraryEntry;
}

const ID = /^[\da-f]{64}$/u;

export function isPartLibraryEntry(value: unknown): value is PartLibraryEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r['id'] === 'string' &&
    isPixelCustomPart(r['part']) &&
    customPartId(r['part']) === r['id'] &&
    typeof r['name'] === 'string' &&
    r['name'].length <= MAX_PART_NAME &&
    Array.isArray(r['origins']) &&
    r['origins'].length > 0 &&
    r['origins'].every((origin) => (PART_ORIGINS as readonly unknown[]).includes(origin)) &&
    (r['parent'] === undefined || (typeof r['parent'] === 'string' && ID.test(r['parent']))) &&
    (r['author'] === undefined ||
      (typeof r['author'] === 'string' && r['author'].length <= MAX_PART_NAME)) &&
    (r['parentAuthor'] === undefined ||
      (typeof r['parentAuthor'] === 'string' && r['parentAuthor'].length <= MAX_PART_NAME)) &&
    typeof r['addedAt'] === 'string'
  );
}

export function createPartLibrary(options: {
  database: OperationalDatabaseModulePort;
  now?: () => Date;
}): PartLibrary {
  const { database } = options;
  const now = options.now ?? (() => new Date());
  const read = (id?: string): PartLibraryEntry[] =>
    database.read((db) => {
      const rows =
        id === undefined
          ? db.prepare('SELECT body FROM avatar_part_library ORDER BY rowid DESC').all()
          : db.prepare('SELECT body FROM avatar_part_library WHERE id = ?').all(id);
      return rows.flatMap((row) => {
        const parsed: unknown = JSON.parse(String(row['body']));
        return isPartLibraryEntry(parsed) ? [parsed] : [];
      });
    });
  return {
    list: () => read(),
    get: (id) => (ID.test(id) ? read(id)[0] : undefined),
    add(input) {
      const part = canonicalCustomPart(input.part);
      const id = customPartId(part);
      const name = input.name.trim().slice(0, MAX_PART_NAME);
      const [existing] = read(id);
      const entry: PartLibraryEntry = existing
        ? {
            ...existing,
            name: existing.name || name,
            origins: existing.origins.includes(input.origin)
              ? existing.origins
              : [...existing.origins, input.origin],
          }
        : {
            id,
            part,
            name,
            origins: [input.origin],
            ...(input.parent !== undefined && input.parent !== id ? { parent: input.parent } : {}),
            ...(input.author ? { author: input.author.slice(0, MAX_PART_NAME) } : {}),
            ...(input.parentAuthor
              ? { parentAuthor: input.parentAuthor.slice(0, MAX_PART_NAME) }
              : {}),
            addedAt: now().toISOString(),
          };
      database.transaction(
        (db) => {
          db.prepare(
            `INSERT INTO avatar_part_library (id, body) VALUES (?, ?)
            ON CONFLICT (id) DO UPDATE SET body = excluded.body`,
          ).run(id, JSON.stringify(entry));
        },
        ['avatar-part-library'],
      );
      return entry;
    },
  };
}
