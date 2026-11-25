import { useMaterialRoles } from '../design/material-tokens';

export function useComposerOutline(): string | undefined {
  return useMaterialRoles().outlineVariant;
}
