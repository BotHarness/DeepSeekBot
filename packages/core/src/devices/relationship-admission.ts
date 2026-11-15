import {
  credentialKey,
  type CredentialProvider,
  type CredentialRecord,
} from '@deepseek-ai/dsh-credentials';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { isPrivateRoute } from '../../../../apps/mobile/src/host/route.js';
import {
  relationshipRouteAdmissionSchema,
  type RelationshipTransportPeer,
} from './relationship-contract.js';
import { RelationshipRefused, type HostRelationships } from './relationships.js';

const storedAdmission = z.object({
  version: z.literal(1),
  hostId: z.string(),
  publicKey: z.string(),
  admission: relationshipRouteAdmissionSchema,
});

export type RelationshipCredentialProvider = Pick<
  CredentialProvider,
  'readRecord' | 'modifyRecord' | 'deleteRecord'
>;

export function createRelationshipAdmissions(options: {
  relationships: HostRelationships;
  credentials?: () => RelationshipCredentialProvider | undefined;
  isOpen?: () => boolean;
}) {
  const updates = new Map<string, Promise<void>>();
  const checkOpen = () => {
    if (options.isOpen?.() === false) throw new RelationshipRefused('relationship-owner-closed');
  };
  const serial = async <T>(id: string, operation: () => Promise<T>): Promise<T> => {
    const result = (updates.get(id) ?? Promise.resolve()).then(operation, operation);
    const settled = result.then(
      () => {},
      () => {},
    );
    updates.set(id, settled);
    try {
      return await result;
    } finally {
      if (updates.get(id) === settled) updates.delete(id);
    }
  };
  const key = (id: string) =>
    credentialKey(
      'botharness-core',
      `relationship-route-${createHash('sha256').update(id).digest('hex')}`,
    );
  const provider = () => {
    const credentials = options.credentials?.();
    if (!credentials) throw new RelationshipRefused('relationship-route-secret-unavailable');
    return credentials;
  };
  return {
    async read(id: string) {
      checkOpen();
      const relationship = options.relationships.read(id);
      if (!relationship.peer.routes.some(isPrivateRoute)) return undefined;
      try {
        const record = await provider().readRecord(key(id));
        checkOpen();
        const parsed = storedAdmission.safeParse(
          record?.kind === 'grant' ? record.payload : undefined,
        );
        if (
          !parsed.success ||
          parsed.data.hostId !== relationship.peer.id ||
          parsed.data.publicKey !== relationship.peer.publicKey
        )
          throw new RelationshipRefused('relationship-route-secret-unavailable');
        return parsed.data.admission;
      } catch {
        throw new RelationshipRefused('relationship-route-secret-unavailable');
      }
    },
    async remember(id: string, peer: RelationshipTransportPeer) {
      if (!peer.privateRelay) return;
      return serial(id, async () => {
        checkOpen();
        const relationship = options.relationships.check(id, peer.publicKey);
        if (relationship.peer.id !== peer.id || relationship.peer.publicKey !== peer.publicKey)
          throw new RelationshipRefused('relationship-identity-mismatch');
        try {
          const credentials = provider();
          let previous: CredentialRecord | undefined;
          await credentials.modifyRecord(key(id), async (current) => {
            previous = current;
            checkOpen();
            options.relationships.check(id, peer.publicKey);
            if (options.isOpen?.() === false)
              throw new RelationshipRefused('relationship-owner-closed');
            return {
              kind: 'grant',
              payload: {
                version: 1,
                hostId: peer.id,
                publicKey: peer.publicKey,
                admission: peer.privateRelay,
              },
            };
          });
          try {
            checkOpen();
            options.relationships.check(id, peer.publicKey);
            if (options.isOpen?.() === false)
              throw new RelationshipRefused('relationship-owner-closed');
          } catch (error) {
            if (options.isOpen?.() === false) {
              await credentials.modifyRecord(key(id), async () => previous);
              throw error;
            }
            const latest = options.relationships.read(id);
            if (latest.state !== 'disconnected' || latest.peerRevocationPending)
              await credentials.modifyRecord(key(id), async () => previous);
            else await credentials.deleteRecord(key(id));
            throw error;
          }
        } catch (error) {
          if (error instanceof RelationshipRefused) throw error;
          throw new RelationshipRefused('relationship-route-secret-unavailable');
        }
      });
    },
    async forget(id: string) {
      return serial(id, async () => {
        checkOpen();
        const relationship = options.relationships.read(id);
        if (relationship.state !== 'disconnected' || relationship.peerRevocationPending)
          throw new RelationshipRefused('relationship-revocation-pending');
        if (!options.credentials?.()) {
          if (relationship.peer.routes.some(isPrivateRoute))
            throw new RelationshipRefused('relationship-route-secret-unavailable');
          return;
        }
        try {
          await provider().deleteRecord(key(id));
        } catch {
          throw new RelationshipRefused('relationship-route-secret-unavailable');
        }
      });
    },
  };
}
