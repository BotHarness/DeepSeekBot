import { router } from 'expo-router';
import { cloudClient } from '../../cloud/native';
import { prepareCloudCreation } from '../../cloud/prepare-creation';
import type { CreationTarget } from '../../host/creation-targets';

export async function openCloudCreation(
  target: Extract<CreationTarget, { kind: 'cloud' }>,
  action: 'channel' | 'invite',
  stillCurrent: () => boolean,
  replace = false,
) {
  await prepareCloudCreation(cloudClient, target.workspace);
  if (!stillCurrent()) return;
  const href = {
    pathname:
      action === 'invite' ? ('/cloud-invitations' as const) : ('/cloud-create-channel' as const),
    params: {
      instanceId: target.workspace.instanceId,
      organizationId: target.workspace.organizationId,
      accountScope: target.workspace.scope,
    },
  };
  if (replace) router.replace(href);
  else router.push(href);
}
