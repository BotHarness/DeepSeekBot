import { useMemo } from 'react';

export function useBotNames(
  bots: ReadonlyArray<{ slug: string; displayName: string }> | undefined,
) {
  const key = JSON.stringify((bots ?? []).map(({ slug, displayName }) => [slug, displayName]));
  return useMemo(() => {
    const names = new Map<string, string>(JSON.parse(key));
    return (id: string): string => names.get(id) ?? id;
  }, [key]);
}
