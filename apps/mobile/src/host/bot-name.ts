import type { HostClient } from '@botharness/host-client/client';
import { loadBotDetail, updateBot } from '@botharness/host-client/bots';

export async function renameBot(
  client: HostClient,
  slug: string,
  displayName: string,
): Promise<void> {
  const { profileFingerprint } = await loadBotDetail(client, slug);
  await updateBot(client, slug, { displayName }, profileFingerprint);
  await client.refresh().catch(() => undefined);
}
