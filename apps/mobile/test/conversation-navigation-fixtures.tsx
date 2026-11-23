import { type ChatPlace } from '../src/ui/chat/conversation-screen';
import { state } from './conversation-navigation-mocks';

export function focusConversation(): ChatPlace {
  state.active = true;
  state.host.roster.bots = [
    {
      slug: 'ada',
      displayName: 'Ada',
      state: 'idle',
      roles: [],
      computerAccess: false,
      browserAccess: false,
      paused: false,
    },
  ];
  state.conversation.messages = ['first', 'second'].map((id) => ({
    id,
    at: '',
    author: 'bot',
    bot: 'ada',
    body: id,
    attachments: [],
    delivery: 'committed',
  }));
  return { kind: 'dm', slug: 'ada' };
}
