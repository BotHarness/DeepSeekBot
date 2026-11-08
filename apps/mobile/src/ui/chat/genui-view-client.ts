import { createContext } from 'react';

import type { GenuiViewClient } from '../../genui/view';

export const GenuiViewHost = createContext<GenuiViewClient | undefined>(undefined);
