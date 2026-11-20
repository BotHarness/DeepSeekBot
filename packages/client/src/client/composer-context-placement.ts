import { createContext } from 'react';

export type ComposerContextPlacement = 'composer' | 'header';

export const ComposerContextPlacementContext = createContext<ComposerContextPlacement>('composer');
