import type { HostClient } from './client';
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

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid deletion response');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid deletion response');
  return value;
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('Invalid deletion dependencies');
  return value.map(text);
}
function result(value: unknown): DeletionResult {
  const entry = record(value);
  const phase = entry['phase'];
  const memory = entry['memory'];
  if (
    (phase !== 'stopping' &&
      phase !== 'cleanup' &&
      phase !== 'complete' &&
      phase !== 'incomplete') ||
    (memory !== 'retained' && memory !== 'pending' && memory !== 'erased') ||
    typeof entry['eraseMemory'] !== 'boolean'
  )
    throw new Error('Invalid deletion result');
  return {
    phase,
    memory,
    eraseMemory: entry['eraseMemory'],
    ...(entry['failure'] === undefined ? {} : { failure: text(entry['failure']) }),
  };
}

export async function previewDeletion(
  client: DeletionClient,
  slug: string,
): Promise<DeletionPreview> {
  const entry = record(record(await client.call('deletionPreview', { slug }))['preview']);
  const dependencies = record(entry['dependencies']);
  if (entry['slug'] !== slug || typeof entry['eraseAvailable'] !== 'boolean')
    throw new Error('Invalid deletion preview');
  return {
    slug,
    displayName: text(entry['displayName']),
    memoryDir: text(entry['memoryDir']),
    token: text(entry['token']),
    eraseAvailable: entry['eraseAvailable'],
    ...(entry['refusal'] === undefined ? {} : { refusal: text(entry['refusal']) }),
    dependencies: {
      sessions: strings(dependencies['sessions']),
      workspaces: strings(dependencies['workspaces']),
      grants: strings(dependencies['grants']),
      identities: strings(dependencies['identities']),
      channels: strings(dependencies['channels']),
    },
    ...(entry['deletion'] === undefined ? {} : { deletion: result(entry['deletion']) }),
  };
}

export async function confirmBotDeletion(
  client: DeletionClient,
  preview: DeletionPreview,
  eraseMemory: boolean,
) {
  const response = await client.call('deletionConfirm', {
    slug: preview.slug,
    token: preview.token,
    eraseMemory,
  });
  return result(record(response)['deletion']);
}

export async function retryBotDeletion(client: DeletionClient, slug: string) {
  return result(record(await client.call('deletionRetry', { slug }))['deletion']);
}

export async function deleteGroupOrSection(
  client: DeletionClient,
  target: DeletionTarget,
): Promise<void> {
  if (target.kind === 'bot') throw new Error('Bot deletion requires a reviewed preview');
  const group = target.kind === 'group';
  const response = record(
    await client.call(
      group ? 'channelGroupDelete' : 'sectionRemove',
      group ? { channelId: target.id } : { sectionId: target.id },
    ),
  );
  if (response[group ? 'deleted' : 'removed'] !== true)
    throw new Error('Deletion was not confirmed');
}
