function routedHost(params: unknown): string | undefined {
  if (typeof params !== 'object' || params === null || !('hostId' in params)) return undefined;
  return typeof params.hostId === 'string' ? params.hostId : '';
}

export function profileHostSource(
  params: unknown,
  entryParams: unknown,
  fallback: string | undefined,
): string | undefined {
  return routedHost(params) ?? routedHost(entryParams) ?? fallback;
}
