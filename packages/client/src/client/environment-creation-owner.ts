import type { HostClient } from '../../../../apps/mobile/src/host/client.js';
import {
  assignRosterChannel,
  createGroupChannel,
  createPersonaBot,
  type BridgeCall,
  type CreatePersonaBotInput,
  type CreatedBot,
  openDmChannel,
} from './bridge.js';
import type { ChannelSummary } from './store.js';
import type { BridgeActions } from './actions.js';

export function bindBotCreationOwner(
  local: Pick<BridgeActions, 'createBot' | 'openCreatedBot'>,
  remote?: ReturnType<typeof remoteCreationOwner>,
): Pick<BridgeActions, 'createBot' | 'openCreatedBot'> {
  return remote ? { createBot: remote.bot, openCreatedBot: remote.openBot } : local;
}

export function remoteCreationOwner({
  hostId,
  client,
  current,
  open,
  committed = () => {},
}: {
  hostId: string;
  client: Pick<HostClient, 'refresh'> & {
    call: (method: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
  current: () => boolean;
  open: (target: { hostId: string; title: string; botSlug?: string; channelId?: string }) => void;
  committed?: () => void;
}) {
  const call: BridgeCall = async (method, args) => ({
    ok: true,
    value: await client.call(method, args),
  });
  let botReceipt: CreatedBot | undefined;
  let channelReceipt: ChannelSummary | undefined;
  let dmId: string | undefined;
  const openBot = async (created: CreatedBot, sectionId?: string): Promise<void> => {
    dmId ??= (await openDmChannel(call, created.slug, created.displayName)).id;
    if (sectionId) await assignRosterChannel(call, dmId, sectionId);
    await client.refresh();
    if (current()) open({ hostId, title: created.displayName, botSlug: created.slug });
  };
  return {
    openBot,
    async bot(input: CreatePersonaBotInput, sectionId?: string) {
      if (!botReceipt) {
        botReceipt = await createPersonaBot(call, input);
        committed();
      }
      if (botReceipt.httpsFallback === undefined) await openBot(botReceipt, sectionId);
      return botReceipt;
    },
    async channel(name: string, sectionId?: string) {
      if (!channelReceipt) {
        channelReceipt = await createGroupChannel(call, name);
        committed();
      }
      if (sectionId) await assignRosterChannel(call, channelReceipt.id, sectionId);
      await client.refresh();
      if (current()) open({ hostId, title: channelReceipt.name, channelId: channelReceipt.id });
      return channelReceipt;
    },
  };
}
