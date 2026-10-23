import { t } from '../strings';

export const creationCopy = t.botCreation;
export function creationError(code: string): string {
  const entry = Object.entries(creationCopy.errors).find(([key]) => key === code);
  return entry?.[1] ?? creationCopy.refused;
}
