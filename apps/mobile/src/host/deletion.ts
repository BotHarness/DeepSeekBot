import {
  confirmBotDeletion as confirmDeletion,
  previewBotDeletion,
  retryBotDeletion as retryDeletion,
} from '@botharness/host-client/deletion-readers';
import {
  deleteGroupChannel,
  removeRosterSection,
} from '@botharness/host-client/channel-management';
import type { HostClient } from '@botharness/host-client/client';
import type {
  PersonaBotDeletionPreview,
  PersonaBotDeletion,
} from '../../../../packages/core/src/bots/deletion';

export type DeletionTarget = { kind: 'bot' | 'group' | 'section'; id: string; name: string };
export type DeletionClient = Pick<HostClient, 'refresh'> & {
  call(method: string, args?: Record<string, unknown>): Promise<unknown>;
};
export type DeletionPreview = Pick<
  PersonaBotDeletionPreview,
  'slug' | 'displayName' | 'memoryDir' | 'token' | 'eraseAvailable' | 'refusal' | 'dependencies'
> & {
  deletion?: DeletionResult;
};
export type DeletionResult = Pick<
  PersonaBotDeletion,
  'phase' | 'memory' | 'eraseMemory' | 'failure'
>;

function deletionView({ phase, memory, eraseMemory, failure }: PersonaBotDeletion): DeletionResult {
  return { phase, memory, eraseMemory, ...(failure === undefined ? {} : { failure }) };
}

export async function previewDeletion(
  client: DeletionClient,
  slug: string,
): Promise<DeletionPreview> {
  const { deletion, ...preview } = (await previewBotDeletion(client, slug)).preview;
  return { ...preview, ...(deletion === undefined ? {} : { deletion: deletionView(deletion) }) };
}

export async function confirmBotDeletion(
  client: DeletionClient,
  preview: DeletionPreview,
  eraseMemory: boolean,
) {
  const { deletion } = await confirmDeletion(client, {
    slug: preview.slug,
    token: preview.token,
    eraseMemory,
  });
  return deletionView(deletion);
}

export async function retryBotDeletion(client: DeletionClient, slug: string) {
  return deletionView((await retryDeletion(client, slug)).deletion);
}

export async function deleteGroupOrSection(
  client: DeletionClient,
  target: DeletionTarget,
): Promise<void> {
  if (target.kind === 'bot') throw new Error('Bot deletion requires a reviewed preview');
  if (target.kind === 'group') return deleteGroupChannel(client, target.id);
  if (!(await removeRosterSection(client, target.id)))
    throw new Error('Deletion was not confirmed');
}
