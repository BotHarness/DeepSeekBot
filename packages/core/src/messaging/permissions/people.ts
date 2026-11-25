import { isMessagingPlatform, messagingPlatform } from '../platforms/index.js';
import type { PeopleNamespace, PlatformPeople } from '../platforms/types.js';
import type { MessagingInboundEvent } from '../provider.js';

export type ChatSenderNamespace = PeopleNamespace;

export function platformPeople(platform: string): PlatformPeople | undefined {
  return isMessagingPlatform(platform) ? messagingPlatform(platform).people : undefined;
}

export function chatPairingApplies(event: Omit<MessagingInboundEvent, 'text'>): boolean {
  const people = platformPeople(event.channel);
  return !!people && (!!people.groups || event.conversation.kind === 'dm');
}

export function chatSenderIdentity(
  event: Omit<MessagingInboundEvent, 'text'>,
): { providerId: string; namespace: ChatSenderNamespace } | undefined {
  const people = platformPeople(event.channel);
  if (event.actor.kind !== 'user' || !people || !chatPairingApplies(event) || !people.sender(event))
    return undefined;
  return { providerId: `dsh-im/${event.channel}`, namespace: people.namespace };
}

export function chatSenderNamespace(platform: string): ChatSenderNamespace | undefined {
  return platformPeople(platform)?.namespace;
}
