import { createContext, useContext } from 'react';

export type SettingsFormPlace = 'form' | 'section' | false;

export const SettingsFormContext = createContext<SettingsFormPlace>(false);

export function useSettingsFormPlace() {
  return useContext(SettingsFormContext);
}
