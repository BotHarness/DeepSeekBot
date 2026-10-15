import type { HostClient } from './client';

export function humanNameOf(identity: unknown): string | undefined {
  const name =
    typeof identity === 'object' && identity !== null
      ? (identity as Record<string, unknown>)['displayName']
      : undefined;
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : undefined;
}

export async function loadHumanName(client: HostClient): Promise<string | undefined> {
  return humanNameOf(await client.call<unknown>('humanIdentity'));
}
