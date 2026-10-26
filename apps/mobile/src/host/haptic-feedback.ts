import { createTogglePreference } from './toggle-preference';

export function createHapticPreferences(storage: {
  read(): Promise<unknown>;
  write(enabled: boolean): void;
}) {
  return createTogglePreference(storage, true);
}
