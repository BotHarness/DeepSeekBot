import { t } from '../strings';
import { interfacePreferences } from '../interface-preferences';

export let creationCopy = t.botCreation;
interfacePreferences.subscribe(() => {
  creationCopy = t.botCreation;
});
export function creationError(code: string): string {
  const entry = Object.entries(creationCopy.errors).find(([key]) => key === code);
  return entry?.[1] ?? creationCopy.refused;
}
