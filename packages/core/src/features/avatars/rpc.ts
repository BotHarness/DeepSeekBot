import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
import { unwrap } from '../../bridge/rpc-result.js';
import type { PersonaBotDetail } from '../../bridge/methods.js';
import type { PartLibraryEntry } from '../../bots/part-library.js';
import type { BotMetadataResult } from '../../team/bot-administration.js';
import type { AvatarsBridgeMethods } from './methods.js';

type AdminResult<T> = T | BotMetadataResult;

export function botAvatarSet(
  methods: AvatarsBridgeMethods,
  channelId: string,
  avatar: string | null,
): AdminResult<{ bot: PersonaBotDetail }> {
  return unwrap(methods.botAvatarSet({ channelId, avatar }));
}

export function botBannerSet(
  methods: AvatarsBridgeMethods,
  channelId: string,
  banner: unknown,
): AdminResult<{ bot: PersonaBotDetail }> {
  return unwrap(methods.botBannerSet({ channelId, banner }));
}

export function botAppearanceSet(
  methods: AvatarsBridgeMethods,
  channelId: string,
  recipe: unknown,
): AdminResult<{ bot: PersonaBotDetail }> {
  return unwrap(methods.botAppearanceSet({ channelId, recipe }));
}

export function botPrimaryColorSet(
  methods: AvatarsBridgeMethods,
  channelId: string,
  primaryColor: unknown,
): AdminResult<{ bot: PersonaBotDetail }> {
  return unwrap(methods.botPrimaryColorSet({ channelId, primaryColor }));
}

export function partLibraryList(methods: AvatarsBridgeMethods): { parts: PartLibraryEntry[] } {
  return unwrap(methods.partLibraryList());
}

export function partLibraryAdd(
  methods: AvatarsBridgeMethods,
  part: unknown,
  name: string,
  parent?: string,
): { entry: PartLibraryEntry } {
  return unwrap(methods.partLibraryAdd({ part, name, parent }));
}

export function partLibraryExport(
  methods: AvatarsBridgeMethods,
  id?: string,
  part?: unknown,
): { fileName: string; data: string } {
  return unwrap(
    methods.partLibraryExport(part !== undefined ? { part } : id === undefined ? {} : { id }),
  );
}

export function partLibraryImport(
  methods: AvatarsBridgeMethods,
  data: string,
): {
  added: PartLibraryEntry[];
  refused: { name: string; reason: string }[];
} {
  return unwrap(methods.partLibraryImport({ data }));
}

export function partLibraryImportImage(
  methods: AvatarsBridgeMethods,
  data: string,
  slot: string,
  colors: number,
  name: string,
): { entry: PartLibraryEntry } {
  return unwrap(methods.partLibraryImportImage({ data, slot, colors, name }));
}

export const avatarRpc = {
  botAvatarSet(channelId: string, avatar: string | null): AdminResult<{ bot: PersonaBotDetail }> {
    return botAvatarSet(this.methods, channelId, avatar);
  },

  partLibraryList(): { parts: PartLibraryEntry[] } {
    return partLibraryList(this.methods);
  },

  partLibraryExport(id?: string, part?: unknown): { fileName: string; data: string } {
    return partLibraryExport(this.methods, id, part);
  },

  partLibraryImport(data: string): {
    added: PartLibraryEntry[];
    refused: { name: string; reason: string }[];
  } {
    return partLibraryImport(this.methods, data);
  },

  partLibraryImportImage(
    data: string,
    slot: string,
    colors: number,
    name: string,
  ): { entry: PartLibraryEntry } {
    return partLibraryImportImage(this.methods, data, slot, colors, name);
  },

  partLibraryAdd(part: unknown, name: string, parent?: string): { entry: PartLibraryEntry } {
    return partLibraryAdd(this.methods, part, name, parent);
  },

  botBannerSet(channelId: string, banner: unknown): AdminResult<{ bot: PersonaBotDetail }> {
    return botBannerSet(this.methods, channelId, banner);
  },

  botAppearanceSet(channelId: string, recipe: unknown): AdminResult<{ bot: PersonaBotDetail }> {
    return botAppearanceSet(this.methods, channelId, recipe);
  },

  botPrimaryColorSet(
    channelId: string,
    primaryColor: unknown,
  ): AdminResult<{ bot: PersonaBotDetail }> {
    return botPrimaryColorSet(this.methods, channelId, primaryColor);
  },
} satisfies ThisType<BridgeRpcReceiver>;
