import { createContext } from 'react';

import type { GenuiDocumentReply } from '../../genui/document';
import type { GenuiViewClient } from '../../genui/view';
import type { GenuiInputViewport } from './genui-input-viewport';

export const GenuiViewHost = createContext<GenuiViewClient | undefined>(undefined);

export type GenuiReplySend = (body: string, reply: GenuiDocumentReply) => string;

export const GenuiInteraction = createContext<
  { send: GenuiReplySend | undefined; inputViewport: GenuiInputViewport | undefined } | undefined
>(undefined);
