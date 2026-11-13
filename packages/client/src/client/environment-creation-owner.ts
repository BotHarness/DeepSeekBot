import type { HostClient } from '../../../../apps/mobile/src/host/client.js';
import { gitImportSource } from '../../../../apps/mobile/src/host/bot-creation.js';
import {
  assignRosterChannel,
  createGroupChannel,
  createPersonaBot,
  type BridgeCall,
  type CreatePersonaBotInput,
  type CreatedBot,
  openDmChannel,
  BridgeCallError,
} from './bridge.js';
import type { ChannelSummary } from './store.js';
import type { BridgeActions } from './actions.js';

export function bindBotCreationOwner(
  local: Pick<BridgeActions, 'createBot' | 'openCreatedBot'>,
  remote?: ReturnType<typeof remoteCreationOwner>,
): Pick<BridgeActions, 'createBot' | 'openCreatedBot'> {
  return remote ? { createBot: remote.bot, openCreatedBot: remote.openBot } : local;
}

export function localCreationOwner(
  actions: Pick<BridgeActions, 'createBot' | 'openCreatedBot' | 'createGroup' | 'previewBotImport'>,
  lifecycle: { submitted(): void; committed(): void },
  key: () => string = () => crypto.randomUUID(),
) {
  let botInput: CreatePersonaBotInput | undefined;
  let botReceipt: CreatedBot | undefined;
  let channelInput: { name: string; operationKey: string } | undefined;
  let channelReceipt: ChannelSummary | undefined;
  return {
    openCreatedBot: actions.openCreatedBot,
    async createBot(input: CreatePersonaBotInput, sectionId?: string) {
      if (!botInput) {
        const source = input.gitUrl ? await actions.previewBotImport(input.gitUrl) : undefined;
        botInput = {
          ...input,
          roles: [...input.roles],
          operationKey: key(),
          ...(source ? { expectedCommit: source.commit } : {}),
        };
      }
      if (!botReceipt) {
        lifecycle.submitted();
        botReceipt = await actions.createBot(botInput, sectionId);
        lifecycle.committed();
      }
      return botReceipt;
    },
    async createGroup(name: string, sectionId?: string) {
      channelInput ??= { name, operationKey: key() };
      if (!channelReceipt) {
        lifecycle.submitted();
        channelReceipt = await actions.createGroup(
          channelInput.name,
          sectionId,
          channelInput.operationKey,
        );
        if (channelReceipt) lifecycle.committed();
      }
      return channelReceipt;
    },
  };
}

export function remoteCreationOwner({
  hostId,
  client,
  current,
  open,
  committed = () => {},
  submitted = () => {},
  key = () => crypto.randomUUID(),
}: {
  hostId: string;
  client: Pick<HostClient, 'refresh'> & {
    call: (method: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
  current: () => boolean;
  open: (target: { hostId: string; title: string; botSlug?: string; channelId?: string }) => void;
  committed?: () => void;
  submitted?: () => void;
  key?: () => string;
}) {
  const request = async (method: string, args: Record<string, unknown>): Promise<unknown> => {
    if (!current())
      throw new BridgeCallError(
        'connection-host-changed',
        'This connection changed. Close and reopen the form.',
      );
    return client.call(method, args);
  };
  const call: BridgeCall = async (method, args) => ({
    ok: true,
    value: await request(method, args),
  });
  let botReceipt: CreatedBot | undefined;
  let botInput: CreatePersonaBotInput | undefined;
  let channelReceipt: ChannelSummary | undefined;
  let channelInput: { name: string; operationKey: string } | undefined;
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
        if (!botInput) {
          let source: { gitUrl: string; commit: string } | undefined;
          if (input.gitUrl) {
            const value = await request('botImportPreview', { gitUrl: input.gitUrl });
            if (typeof value !== 'object' || value === null || !('source' in value))
              throw new Error('Invalid Git preview');
            source = gitImportSource(value.source);
          }
          botInput = {
            ...input,
            roles: [...input.roles],
            operationKey: key(),
            ...(source ? { expectedCommit: source.commit } : {}),
          };
        }
        submitted();
        botReceipt = await createPersonaBot(call, botInput);
        committed();
      }
      if (botReceipt.httpsFallback === undefined) await openBot(botReceipt, sectionId);
      return botReceipt;
    },
    async channel(name: string, sectionId?: string) {
      if (!channelReceipt) {
        channelInput ??= { name, operationKey: key() };
        submitted();
        channelReceipt = await createGroupChannel(
          call,
          channelInput.name,
          undefined,
          channelInput.operationKey,
        );
        committed();
      }
      if (sectionId) await assignRosterChannel(call, channelReceipt.id, sectionId);
      await client.refresh();
      if (current()) open({ hostId, title: channelReceipt.name, channelId: channelReceipt.id });
      return channelReceipt;
    },
  };
}
