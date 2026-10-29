import { createContext } from 'react';
import type { Appearance } from './appearance.js';
export const AppearanceContext = createContext<Appearance | undefined>(undefined);
