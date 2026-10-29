import { useMaterialColors, type MaterialColors } from '@expo/ui/jetpack-compose';

import { useDesignTheme } from './theme';

export type MaterialRoles = MaterialColors;

export const materialType = {
  meta: 'bodySmall',
  body: 'bodyMedium',
  title: 'titleMedium',
  display: 'headlineSmall',
} as const;

export function useMaterialRoles(): MaterialRoles {
  const theme = useDesignTheme();
  return useMaterialColors({ colorScheme: theme.scheme, seedColor: theme.color.accent });
}
