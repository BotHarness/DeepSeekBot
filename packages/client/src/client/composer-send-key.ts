import { createContext } from 'react';

import type { BotModeSendKey } from '@botharness/host-client/shared/bot-mode-settings';

export type ComposerSendKey = BotModeSendKey;

export const ComposerSendKeyContext = createContext<ComposerSendKey>('enter');
