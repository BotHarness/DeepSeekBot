import type { CloudClient } from './client';
import type { ConversationWorkspace } from './conversations';
import { ClientError } from './instance-contract';
import { cloudViewScope } from './workspace-directory';

export async function prepareCloudCreation(
  client: Pick<CloudClient, 'getSnapshot' | 'whoami' | 'useOrganization'>,
  target: ConversationWorkspace,
) {
  const assertSource = () => {
    const row = client.getSnapshot().rows.find((r) => r.config.instanceId === target.instanceId);
    if (!row?.hasSession || cloudViewScope(row) !== target.scope)
      throw new ClientError('SOURCE_CHANGED');
  };
  assertSource();
  await client.whoami(target.instanceId);
  assertSource();
  const org = await client.useOrganization(target.instanceId, target.organizationId);
  assertSource();
  if (org.organizationId !== target.organizationId || org.role !== 'owner')
    throw new ClientError('ORGANIZATION_OWNER_REQUIRED');
}
