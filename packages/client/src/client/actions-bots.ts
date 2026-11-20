import * as deletionReaders from '@botharness/host-client/deletion-readers';
import { gitImportSource } from '@botharness/host-client/bot-creation';
import type { PixelBannerRecipe } from '@botharness/pixel-banner';
import {
  BridgeCallError,
  setBotAvatar as setBotAvatarViaBridge,
  setBotBanner as setBotBannerViaBridge,
  updateBotProfile as updateBotProfileViaBridge,
  setBotAppearance as setBotAppearanceViaBridge,
  setBotPrimaryColor as setBotPrimaryColorViaBridge,
  type BotPrimaryColorChoice,
  loadPartLibrary as loadPartLibraryViaBridge,
  addLibraryPart as addLibraryPartViaBridge,
  exportLibraryParts as exportLibraryPartsViaBridge,
  importLibraryParts as importLibraryPartsViaBridge,
  importLibraryImage as importLibraryImageViaBridge,
  createPersonaBot,
  type CreatedBot,
  downloadBotZip,
  importBotZip,
  loadBotZipFiles,
  type BotZipExportChoice,
  type BotZipFileListing,
  bridgeHost,
  openDmChannel,
  type BridgeCall,
  type CreatePersonaBotInput,
} from './bridge.js';
import type { BotSummary, ClientStore } from './store.js';
import { reportFailure } from './diagnostic-log.js';
import type { ActionResources, BridgeActions } from './actions.js';
import type { RosterActions, createRosterActions } from './actions-roster.js';

export interface BotActions {
  createBot(input: CreatePersonaBotInput, sectionId?: string): Promise<CreatedBot>;
  openCreatedBot(bot: BotSummary, sectionId?: string): Promise<void>;
  importBotZip(file: File, sectionId?: string): Promise<BotSummary>;
  botZipFiles(slug: string): Promise<BotZipFileListing>;
  exportBotZip(slug: string, displayName: string, choice?: BotZipExportChoice): Promise<void>;
  previewBotImport(gitUrl: string): Promise<{ gitUrl: string; commit: string }>;
  setBotAvatar(channelId: string, avatar: string | null): Promise<boolean>;
  setBotBanner(
    channelId: string,
    banner: { recipe: PixelBannerRecipe } | { image: string } | null,
  ): Promise<boolean>;
  setBotPrimaryColor(channelId: string, primaryColor: BotPrimaryColorChoice): Promise<boolean>;
  updateBotProfile(
    slug: string,
    patch: { roles?: string[]; description?: string },
  ): Promise<boolean>;
}

export function createBotActions(
  call: BridgeCall,
  clientStore: ClientStore,
  resources: ActionResources | undefined,
  getActions: () => Pick<BridgeActions, 'openBot'>,
  refreshRoster: RosterActions['refreshRoster'],
  placeCreatedChannelFirst: ReturnType<typeof createRosterActions>['placeCreatedChannelFirst'],
) {
  const openCreatedBot = async (
    bot: BotSummary,
    sectionId: string | undefined,
  ): Promise<BotSummary> => {
    const channel = await openDmChannel(call, bot.slug, bot.displayName);
    clientStore.upsertBot(bot);
    clientStore.upsertChannel(channel);
    await placeCreatedChannelFirst(channel.id, sectionId);
    await getActions().openBot(bot.slug);
    return bot;
  };

  const actions = {
    async deletionPreview(slug) {
      return (await deletionReaders.previewBotDeletion(bridgeHost(call), slug)).preview;
    },
    async deletionConfirm(slug, token, eraseMemory) {
      const { deletion } = await deletionReaders.confirmBotDeletion(bridgeHost(call), {
        slug,
        token,
        eraseMemory,
      });
      await refreshRoster();
      return deletion;
    },
    async deletionRetry(slug) {
      const { deletion } = await deletionReaders.retryBotDeletion(bridgeHost(call), slug);
      await refreshRoster();
      return deletion;
    },
    async createBot(input, sectionId) {
      const created = await createPersonaBot(call, input);
      if (created.httpsFallback === undefined) await openCreatedBot(created, sectionId);
      return created;
    },
    async openCreatedBot(bot, sectionId) {
      await openCreatedBot(bot, sectionId);
    },
    async importBotZip(file, sectionId) {
      if (resources !== undefined) throw new Error('remote-bot-import-unavailable');
      return openCreatedBot(await importBotZip(file), sectionId);
    },
    botZipFiles(slug) {
      if (resources !== undefined) throw new Error('remote-bot-export-unavailable');
      return loadBotZipFiles(slug);
    },
    async exportBotZip(slug, displayName, choice) {
      if (resources !== undefined) throw new Error('remote-bot-export-unavailable');
      const { blob, name } = await downloadBotZip(slug, displayName, choice);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    async previewBotImport(gitUrl) {
      const result = await call('botImportPreview', { gitUrl });
      if (!result.ok) throw new BridgeCallError(result.error.code, result.error.message);
      const value = result.value;
      if (typeof value !== 'object' || value === null || !('source' in value))
        throw new Error('Invalid Git preview');
      return gitImportSource(value.source);
    },
    async setBotAppearance(channelId, recipe) {
      try {
        const bot = await setBotAppearanceViaBridge(call, channelId, recipe);
        clientStore.upsertBot(bot);
        return true;
      } catch {
        return false;
      }
    },
    async loadPartLibrary() {
      try {
        return await loadPartLibraryViaBridge(call);
      } catch {
        return undefined;
      }
    },
    async exportLibraryParts(id, part) {
      try {
        return await exportLibraryPartsViaBridge(call, id, part);
      } catch {
        return undefined;
      }
    },
    async importLibraryParts(data) {
      try {
        return await importLibraryPartsViaBridge(call, data);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    async importLibraryImage(data, slot, colors, name) {
      try {
        return await importLibraryImageViaBridge(call, data, slot, colors, name);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    async addLibraryPart(part, name, parent) {
      try {
        return await addLibraryPartViaBridge(call, part, name, parent);
      } catch {
        return undefined;
      }
    },
    async updateBotProfile(slug, patch) {
      try {
        const bot = await updateBotProfileViaBridge(call, slug, patch);
        clientStore.upsertBot(bot);
        return true;
      } catch (error) {
        reportFailure(
          'personabot-profile-update-failed',
          'PersonaBot profile update failed',
          error,
        );
        return false;
      }
    },
    async setBotAvatar(channelId, avatar) {
      try {
        const bot = await setBotAvatarViaBridge(call, channelId, avatar);
        clientStore.upsertBot(bot);
        return true;
      } catch (error) {
        reportFailure('personabot-avatar-update-failed', 'PersonaBot avatar update failed', error);
        return false;
      }
    },
    async setBotBanner(channelId, banner) {
      try {
        const bot = await setBotBannerViaBridge(call, channelId, banner);
        clientStore.upsertBot(bot);
        return true;
      } catch (error) {
        reportFailure('bot-banner-update-failed', 'Bot banner update failed', error);
        return false;
      }
    },
    async setBotPrimaryColor(channelId, primaryColor) {
      try {
        const bot = await setBotPrimaryColorViaBridge(call, channelId, primaryColor);
        clientStore.upsertBot(bot);
        return true;
      } catch (error) {
        reportFailure('bot-primary-color-update-failed', 'Bot Primary Color update failed', error);
        return false;
      }
    },
  } satisfies BotActions &
    Pick<
      BridgeActions,
      | 'deletionPreview'
      | 'deletionConfirm'
      | 'deletionRetry'
      | 'setBotAppearance'
      | 'exportLibraryParts'
      | 'importLibraryParts'
      | 'importLibraryImage'
      | 'loadPartLibrary'
      | 'addLibraryPart'
    >;
  return { actions, openCreatedBot };
}
