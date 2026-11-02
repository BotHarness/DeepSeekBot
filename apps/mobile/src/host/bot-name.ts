import type { HostClient } from './client';

export async function renameBot(
  client: HostClient,
  slug: string,
  displayName: string,
): Promise<void> {
  const { profileFingerprint } = await client.call<{ profileFingerprint: string }>('get', { slug });
  await client.call('update', {
    slug,
    patch: { displayName },
    expectedProfile: profileFingerprint,
  });
  await client.refresh().catch(() => undefined);
}
