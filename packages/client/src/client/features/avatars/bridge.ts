import * as botControl from '@botharness/host-client/bot-control';
import type { PixelBannerRecipe } from '@botharness/pixel-banner';
import { asRecord, bridgeHost, unwrap, type BridgeCall } from '../../bridge-transport.js';
import type { BotSummary } from '../../store.js';

export interface PartImageInfo {
  width: number;
  height: number;
  colors: number;
  slots: string[];
}

export type BotPrimaryColorChoice = { mode: 'automatic' } | { mode: 'custom'; color: string };

type AvatarRecipe = NonNullable<BotSummary['appearance']>['recipe'];

export function createAvatarsBridge<PartLibraryEntry extends { part: unknown }>(
  parseBotSummary: (value: unknown) => BotSummary | undefined,
  isPartLibraryEntry: (value: unknown) => value is PartLibraryEntry,
) {
  type PixelCustomPart = PartLibraryEntry['part'];

  async function setBotAvatar(
    call: BridgeCall,
    channelId: string,
    avatar: string | null,
  ): Promise<BotSummary> {
    const { bot } = await botControl.setBotAvatar(bridgeHost(call), { channelId, avatar });
    return parseBotSummary(bot)!;
  }

  async function setBotBanner(
    call: BridgeCall,
    channelId: string,
    banner: { recipe: PixelBannerRecipe } | { image: string } | null,
  ): Promise<BotSummary> {
    const { bot } = await botControl.setBotBanner(bridgeHost(call), { channelId, banner });
    const summary = parseBotSummary(bot);
    if (summary === undefined) throw new Error('invalid botBannerSet response');
    return summary;
  }

  async function setBotAppearance(
    call: BridgeCall,
    channelId: string,
    recipe: AvatarRecipe,
  ): Promise<BotSummary> {
    const { bot } = await botControl.setBotAppearance(bridgeHost(call), { channelId, recipe });
    const summary = parseBotSummary(bot);
    if (summary === undefined) throw new Error('invalid botAppearanceSet response');
    return summary;
  }

  async function setBotPrimaryColor(
    call: BridgeCall,
    channelId: string,
    primaryColor: BotPrimaryColorChoice,
  ): Promise<BotSummary> {
    const value = asRecord(await unwrap(call, 'botPrimaryColorSet', { channelId, primaryColor }));
    const bot = parseBotSummary(value?.['bot']);
    if (bot === undefined) throw new Error('invalid botPrimaryColorSet response');
    return bot;
  }

  async function loadPartLibrary(call: BridgeCall): Promise<PartLibraryEntry[]> {
    const parts = asRecord(await unwrap(call, 'partLibraryList', {}))?.['parts'];
    if (!Array.isArray(parts)) throw new Error('invalid partLibraryList response');
    return parts.filter(isPartLibraryEntry);
  }

  async function exportLibraryParts(
    call: BridgeCall,
    id?: string,
    part?: PixelCustomPart,
  ): Promise<{ fileName: string; data: string }> {
    const value = asRecord(
      await unwrap(
        call,
        'partLibraryExport',
        part !== undefined ? { part } : id === undefined ? {} : { id },
      ),
    );
    const fileName = value?.['fileName'];
    const data = value?.['data'];
    if (typeof fileName !== 'string' || typeof data !== 'string')
      throw new Error('invalid partLibraryExport response');
    return { fileName, data };
  }

  async function importLibraryParts(
    call: BridgeCall,
    data: string,
  ): Promise<{
    added: PartLibraryEntry[];
    refused: number;
    image?: PartImageInfo;
  }> {
    const value = asRecord(await unwrap(call, 'partLibraryImport', { data }));
    const added = value?.['added'];
    const refused = value?.['refused'];
    if (!Array.isArray(added) || !Array.isArray(refused))
      throw new Error('invalid partLibraryImport response');
    const image = asRecord(value?.['image']);
    const info =
      image &&
      typeof image['width'] === 'number' &&
      typeof image['height'] === 'number' &&
      typeof image['colors'] === 'number' &&
      Array.isArray(image['slots']) &&
      image['slots'].every((slot) => typeof slot === 'string')
        ? {
            width: image['width'],
            height: image['height'],
            colors: image['colors'],
            slots: image['slots'] as string[],
          }
        : undefined;
    return {
      added: added.filter(isPartLibraryEntry),
      refused: refused.length,
      ...(info ? { image: info } : {}),
    };
  }

  async function importLibraryImage(
    call: BridgeCall,
    data: string,
    slot: string,
    colors: number,
    name: string,
  ): Promise<PartLibraryEntry> {
    const entry = asRecord(
      await unwrap(call, 'partLibraryImportImage', { data, slot, colors, name }),
    )?.['entry'];
    if (!isPartLibraryEntry(entry)) throw new Error('invalid partLibraryImportImage response');
    return entry;
  }

  async function addLibraryPart(
    call: BridgeCall,
    part: PixelCustomPart,
    name: string,
    parent?: string,
  ): Promise<PartLibraryEntry> {
    const entry = asRecord(
      await unwrap(call, 'partLibraryAdd', {
        part,
        name,
        ...(parent ? { parent } : {}),
      }),
    )?.['entry'];
    if (!isPartLibraryEntry(entry)) throw new Error('invalid partLibraryAdd response');
    return entry;
  }

  return {
    setBotAvatar,
    setBotBanner,
    setBotAppearance,
    setBotPrimaryColor,
    loadPartLibrary,
    exportLibraryParts,
    importLibraryParts,
    importLibraryImage,
    addLibraryPart,
  };
}
