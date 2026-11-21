import {
  asObject,
  invalidInput,
  unavailable,
  unknownBot,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import type { PersonaBotDetail } from '../../bridge/methods.js';
import { isPersonaBotAvatar, type PersonaBotRecord } from '../../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import { OperationalDatabaseError } from '../../database/owner.js';
import { isBotBanner, seededBotBanner } from '../../bots/bot-banner.js';
import {
  PART_SLOTS,
  customPartId,
  isPixelCustomPart,
  type PartSlot,
} from '../../bots/avatar-appearance.js';
import {
  MAX_PART_IMAGE_BYTES,
  MAX_PART_IMAGE_COLORS,
  MAX_PART_IMAGE_SCALE,
  partFromImage,
  readPartImage,
  type PartImageError,
} from '../../bots/part-image.js';
import { MAX_PART_NAME, type PartLibrary, type PartLibraryEntry } from '../../bots/part-library.js';
import {
  MAX_PART_LIBRARY_FILES,
  MAX_PART_LIBRARY_FILE_BYTES,
  decodePartFiles,
  encodePartFile,
  encodePartLibrary,
  partFileName,
} from '../../bots/part-file.js';

export interface AvatarsBridgeDeps {
  partLibrary?: PartLibrary;
}

export interface AvatarsBridgeMethods {
  botAvatarSet(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  botBannerSet(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  botAppearanceSet(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  botPrimaryColorSet(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  partLibraryList(): BridgeResult<{ parts: PartLibraryEntry[] }>;
  partLibraryAdd(payload: unknown): BridgeResult<{ entry: PartLibraryEntry }>;
  partLibraryExport(payload: unknown): BridgeResult<{ fileName: string; data: string }>;
  partLibraryImport(payload: unknown): BridgeResult<{
    added: PartLibraryEntry[];
    refused: { name: string; reason: string }[];
    image?: {
      width: number;
      height: number;
      colors: number;
      slots: PartSlot[];
    };
  }>;
  partLibraryImportImage(payload: unknown): BridgeResult<{ entry: PartLibraryEntry }>;
}

function partImageMessage(error: PartImageError): string {
  switch (error) {
    case 'too-large':
      return 'The image is larger than 1 MB';
    case 'wrong-size':
      return `The image must be 32×32 or 32×16 pixels, or a whole-number scale of it up to ×${MAX_PART_IMAGE_SCALE}`;
    case 'too-many-colors':
      return `The image has more than ${MAX_PART_IMAGE_COLORS} colors, or more colors than a part can keep`;
    case 'empty':
      return 'The image has no opaque pixels';
    case 'unsupported':
      return 'Interlaced and 16-bit PNGs are not supported';
    case 'not-png':
      return 'The file is not a PNG';
  }
}

export function writeBotAvatar(
  registry: Pick<PersonaBotRegistry, 'update'>,
  slug: string,
  avatar: unknown,
): BridgeResult<PersonaBotRecord> {
  if (avatar !== null && !isPersonaBotAvatar(avatar)) {
    return invalidInput('avatar must be a bounded PNG, JPEG, or WebP data URL');
  }
  const result = registry.update(slug, { avatar: avatar ?? '' });
  if (!result.ok)
    return result.reason === 'not-found' ? unknownBot(slug) : invalidInput('invalid avatar');
  return { ok: true, value: result.record };
}

export function createAvatarsBridgeMethods(
  deps: AvatarsBridgeDeps & {
    registry: Pick<
      PersonaBotRegistry,
      'get' | 'setAppearance' | 'setBanner' | 'setPrimaryColor' | 'update'
    >;
  },
  dmMemory: (payload: unknown) => { botSlug: string } | BridgeResult<never>,
  detailOf: (record: PersonaBotRecord) => { bot: PersonaBotDetail },
): AvatarsBridgeMethods {
  return {
    botAppearanceSet(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const result = deps.registry.setAppearance(scope.botSlug, asObject(payload)['recipe']);
      if (!result.ok)
        return result.reason === 'not-found'
          ? unknownBot(scope.botSlug)
          : invalidInput('invalid Avatar Appearance');
      return { ok: true, value: detailOf(result.record) };
    },
    partLibraryList() {
      if (!deps.partLibrary) return unavailable();
      try {
        return { ok: true, value: { parts: deps.partLibrary.list() } };
      } catch (error) {
        if (error instanceof OperationalDatabaseError) return unavailable();
        throw error;
      }
    },
    partLibraryAdd(payload) {
      if (!deps.partLibrary) return unavailable();
      const input = asObject(payload);
      const part = input['part'];
      const name = input['name'] ?? '';
      const parent = input['parent'];
      if (!isPixelCustomPart(part)) return invalidInput('part must be a valid Custom Part');
      if (typeof name !== 'string' || name.length > MAX_PART_NAME)
        return invalidInput(`name must be a string of at most ${MAX_PART_NAME} characters`);
      if (parent !== undefined && (typeof parent !== 'string' || !/^[\da-f]{64}$/u.test(parent)))
        return invalidInput('parent must be a Custom Part id');
      try {
        const source = parent === undefined ? undefined : deps.partLibrary.get(parent);
        const parentAuthor = source?.author ?? source?.parentAuthor;
        const entry = deps.partLibrary.add({
          part,
          name,
          origin: source ? 'derived' : 'drawn',
          parent,
          ...(parentAuthor ? { parentAuthor } : {}),
        });
        return { ok: true, value: { entry } };
      } catch (error) {
        if (error instanceof OperationalDatabaseError) return unavailable();
        throw error;
      }
    },
    partLibraryExport(payload) {
      if (!deps.partLibrary) return unavailable();
      const input = asObject(payload);
      const id = input['id'];
      const worn = input['part'];
      try {
        if (worn !== undefined) {
          if (!isPixelCustomPart(worn)) return invalidInput('part must be a valid Custom Part');
          const saved = deps.partLibrary.get(customPartId(worn));
          const file = {
            part: worn,
            name: saved?.name ?? '',
            ...(saved?.author ? { author: saved.author } : {}),
          };
          return {
            ok: true,
            value: {
              fileName: partFileName(file),
              data: encodePartFile(file).toString('base64'),
            },
          };
        }
        if (id === undefined) {
          const listed = deps.partLibrary.list();
          if (listed.length > MAX_PART_LIBRARY_FILES)
            return invalidInput(
              `The library has more than ${MAX_PART_LIBRARY_FILES} parts; export parts one at a time`,
            );
          const files = listed.map((entry) => ({
            part: entry.part,
            name: entry.name,
            ...(entry.author ? { author: entry.author } : {}),
          }));
          return {
            ok: true,
            value: {
              fileName: 'part-library.zip',
              data: encodePartLibrary(files).toString('base64'),
            },
          };
        }
        const entry = typeof id === 'string' ? deps.partLibrary.get(id) : undefined;
        if (!entry) return invalidInput('id must name a Part Library part');
        const file = {
          part: entry.part,
          name: entry.name,
          ...(entry.author ? { author: entry.author } : {}),
        };
        return {
          ok: true,
          value: {
            fileName: partFileName(file),
            data: encodePartFile(file).toString('base64'),
          },
        };
      } catch (error) {
        if (error instanceof OperationalDatabaseError) return unavailable();
        throw error;
      }
    },
    partLibraryImport(payload) {
      if (!deps.partLibrary) return unavailable();
      const data = asObject(payload)['data'];
      if (typeof data !== 'string' || data.length > (MAX_PART_LIBRARY_FILE_BYTES * 4) / 3 + 4)
        return invalidInput('data must be a base64 PNG or zip of at most 8 MB');
      const bytes = Buffer.from(data, 'base64');
      const decoded = decodePartFiles(bytes);
      if (decoded === 'no-part-data') {
        const image = readPartImage(bytes);
        if (typeof image === 'string') return invalidInput(partImageMessage(image));
        return {
          ok: true,
          value: {
            added: [],
            refused: [],
            image: {
              width: image.width,
              height: image.height,
              colors: image.colors,
              slots: image.slots,
            },
          },
        };
      }
      if (typeof decoded === 'string')
        return invalidInput(
          decoded === 'too-large'
            ? 'The file is too large'
            : decoded === 'invalid-part'
              ? 'The part data in this file is invalid'
              : 'The file is not a part PNG or a zip of part PNGs',
        );
      try {
        const added = decoded.files.map((file) =>
          deps.partLibrary!.add({
            part: file.part,
            name: file.name,
            origin: 'imported-file',
            author: file.author,
          }),
        );
        return { ok: true, value: { added, refused: decoded.refused } };
      } catch (error) {
        if (error instanceof OperationalDatabaseError) return unavailable();
        throw error;
      }
    },
    partLibraryImportImage(payload) {
      if (!deps.partLibrary) return unavailable();
      const input = asObject(payload);
      const data = input['data'];
      const slot = input['slot'];
      const colors = input['colors'];
      const name = input['name'] ?? '';
      if (typeof data !== 'string' || data.length > (MAX_PART_IMAGE_BYTES * 4) / 3 + 4)
        return invalidInput('data must be a base64 PNG of at most 1 MB');
      if (typeof slot !== 'string' || !Object.hasOwn(PART_SLOTS, slot))
        return invalidInput('slot must be a Custom Part slot');
      if (typeof name !== 'string' || name.length > MAX_PART_NAME)
        return invalidInput(`name must be a string of at most ${MAX_PART_NAME} characters`);
      if (typeof colors !== 'number' || !Number.isInteger(colors) || colors < 1)
        return invalidInput('colors must be a positive integer');
      const image = readPartImage(Buffer.from(data, 'base64'));
      if (typeof image === 'string') return invalidInput(partImageMessage(image));
      const part = partFromImage(image, slot as PartSlot, colors);
      if (typeof part === 'string') return invalidInput(partImageMessage(part));
      try {
        const entry = deps.partLibrary.add({
          part,
          name,
          origin: 'imported-image',
        });
        return { ok: true, value: { entry } };
      } catch (error) {
        if (error instanceof OperationalDatabaseError) return unavailable();
        throw error;
      }
    },
    botBannerSet(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const record = deps.registry.get(scope.botSlug);
      if (record === undefined) return unknownBot(scope.botSlug);
      const banner = asObject(payload)['banner'];
      const next = banner === null ? seededBotBanner(record.displayName || record.slug) : banner;
      if (!isBotBanner(next)) {
        return invalidInput(
          'banner must be null, { recipe: { scene, seed } } or { image } as a 3:1 PNG data URL',
        );
      }
      const result = deps.registry.setBanner(scope.botSlug, next);
      if (!result.ok)
        return result.reason === 'not-found'
          ? unknownBot(scope.botSlug)
          : invalidInput('invalid banner');
      return { ok: true, value: detailOf(result.record) };
    },
    botPrimaryColorSet(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const result = deps.registry.setPrimaryColor(
        scope.botSlug,
        asObject(payload)['primaryColor'],
      );
      if (!result.ok)
        return result.reason === 'not-found'
          ? unknownBot(scope.botSlug)
          : invalidInput(
              "primaryColor must be { mode: 'automatic' } or { mode: 'custom', color: '#rrggbb' }",
            );
      return { ok: true, value: detailOf(result.record) };
    },
    botAvatarSet(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const result = writeBotAvatar(deps.registry, scope.botSlug, asObject(payload)['avatar']);
      return result.ok ? { ok: true, value: detailOf(result.value) } : result;
    },
  };
}
