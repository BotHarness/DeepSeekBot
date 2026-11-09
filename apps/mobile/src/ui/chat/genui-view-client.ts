import { createContext } from 'react';

import type { GenuiDocumentReply } from '../../genui/document';
import type { GenuiViewClient } from '../../genui/view';

export const GenuiViewHost = createContext<GenuiViewClient | undefined>(undefined);

export type GenuiReplySend = (body: string, reply: GenuiDocumentReply) => string;

export const GenuiReplies = createContext<GenuiReplySend | undefined>(undefined);
