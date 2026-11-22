import {
  createHumanAvatarCache,
  type HumanAvatarCache,
} from '@botharness/host-client/human-profile';
import {
  loadHumanIdentity,
  loadHumanAvatars,
  setHumanAvatar,
  sendChannelMessage,
  type BridgeCall,
} from './bridge.js';
import type { ChannelAttachmentRef, ClientStore } from './store.js';
import type { InvokeAction, BridgeActions } from './actions.js';
import type { createConversationActions } from './actions-conversation.js';

export interface HomeActions {
  humanIdentity(signal?: AbortSignal): Promise<import('./bridge.js').LocalHumanIdentity>;
  humanAvatarSet(avatar: string | null): Promise<import('./bridge.js').LocalHumanIdentity>;
  readonly humanAvatars: HumanAvatarCache;
  sendHome(
    channelId: string,
    body: string,
    messageId: string,
    attachments?: ChannelAttachmentRef[],
  ): Promise<void>;
}

export function createHomeActions(
  call: BridgeCall,
  clientStore: ClientStore,
  invoke: InvokeAction,
  getActions: () => Pick<BridgeActions, 'load'>,
  openChannelById: ReturnType<typeof createConversationActions>['openChannelById'],
) {
  const humanAvatars = createHumanAvatarCache((humanIds) => loadHumanAvatars(call, humanIds));

  return {
    tobHome: () => invoke('tobHome', {}),
    humanIdentity: (signal) => loadHumanIdentity(call, signal),
    async humanAvatarSet(avatar) {
      const identity = await setHumanAvatar(call, avatar);
      if (avatar !== null && identity.avatarVersion !== undefined)
        humanAvatars.put({
          humanId: identity.humanId,
          version: identity.avatarVersion,
          avatar,
        });
      return identity;
    },
    humanAvatars,
    async sendHome(channelId, body, messageId, attachments) {
      const message = await sendChannelMessage(
        call,
        channelId,
        body,
        undefined,
        attachments,
        messageId,
      );
      if (message.id !== messageId || message.body !== body || message.author.kind !== 'human')
        throw new Error('Home message could not be confirmed');
      await getActions().load();
      await openChannelById(channelId);
    },
    onboarding: (slug, action) =>
      invoke('onboarding', {
        slug:
          slug !== undefined &&
          clientStore
            .getSnapshot()
            .bots.some((bot) => bot.slug === slug && bot.sharedBy !== undefined)
            ? undefined
            : slug,
        action,
      }),
  } satisfies HomeActions & Pick<BridgeActions, 'tobHome' | 'onboarding'>;
}
