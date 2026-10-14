import { createContext } from 'react';

import type { BotModeSendKey } from '../bot-mode-settings.js';

export type ComposerSendKey = BotModeSendKey;

export const ComposerSendKeyContext = createContext<ComposerSendKey>('enter');
