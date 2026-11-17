import { createContext } from 'react';

export interface MessageAvatars {
  readonly dm: boolean;
  readonly own: boolean;
}

export const NO_MESSAGE_AVATARS: MessageAvatars = { dm: false, own: false };

export const MessageAvatarsContext = createContext<MessageAvatars>(NO_MESSAGE_AVATARS);
