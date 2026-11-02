import { ClientError } from './instance-contract.js';
import { parseCloudCredential } from './transport.js';
import type { CloudConnections } from './connections.js';
export type CloudManagementInput =
  | { operation: 'list' }
  | { operation: 'import'; credential: unknown }
  | { operation: 'policy'; id: string; revision: number; policy: unknown }
  | { operation: 'remove'; id: string; revision: number; confirm: true };
export type CloudManagementResult = {
  connections: ReturnType<CloudConnections['list']>;
  credentialRemoved?: boolean;
};
export function parseCloudManagement(value: unknown): CloudManagementInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ClientError('INVALID_CLOUD_INPUT');
  const p = value as Record<string, unknown>;
  const exact = (keys: string[]) => {
    if (Object.keys(p).length !== keys.length || keys.some((k) => !Object.hasOwn(p, k)))
      throw new ClientError('INVALID_CLOUD_INPUT');
  };
  if (p.operation === 'list') {
    exact(['operation']);
    return { operation: 'list' };
  }
  if (p.operation === 'import') {
    exact(['operation', 'credential']);
    return { operation: 'import', credential: parseCloudCredential(p.credential) };
  }
  if (
    !['policy', 'remove'].includes(String(p.operation)) ||
    typeof p.id !== 'string' ||
    !/^cloud-[a-f0-9]{64}$/.test(p.id) ||
    !Number.isSafeInteger(p.revision) ||
    Number(p.revision) < 1
  )
    throw new ClientError('INVALID_CLOUD_INPUT');
  if (p.operation === 'policy') {
    exact(['operation', 'id', 'revision', 'policy']);
    return { operation: 'policy', id: p.id, revision: Number(p.revision), policy: p.policy };
  }
  exact(['operation', 'id', 'revision', 'confirm']);
  if (p.confirm !== true) throw new ClientError('CLOUD_CONFIRMATION_REQUIRED');
  return { operation: 'remove', id: p.id, revision: Number(p.revision), confirm: true };
}
export async function manageCloud(
  owner: CloudConnections,
  input: CloudManagementInput,
): Promise<CloudManagementResult> {
  switch (input.operation) {
    case 'list':
      return { connections: owner.list() };
    case 'import':
      return { connections: [await owner.import(input.credential)] };
    case 'policy':
      return { connections: [owner.setPolicy(input.id, input.revision, input.policy)] };
    case 'remove': {
      const { credentialRemoved, ...connection } = await owner.remove(input.id, input.revision);
      return { connections: [connection], credentialRemoved };
    }
  }
}
