import { createHash } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { attachOperationalModule, type OperationalDatabaseOwner } from '../database/owner.js';
import { OWNER_HUMAN_CONTEXT } from '../humans/context.js';
import type { TeamService } from '../team/service.js';
import type { ConnectionLike } from './mount-types.js';
import { nodeDeviceCarrier } from './node-carrier.js';
import { createRemoteCustody } from './remote-custody.js';
import {
  createRemoteCustodyHttp,
  createRemoteCustodyStream,
  REMOTE_CUSTODY_PATH,
  REMOTE_CUSTODY_STREAM_PATH,
} from './remote-custody-http.js';

export function mountRemoteCustodyRoutes(
  webCtx: Context,
  connection: ConnectionLike,
  options: {
    database: OperationalDatabaseOwner;
    credentials?: () => CredentialProvider | undefined;
    team?: TeamService;
  },
): void {
  webCtx.effect(() => {
    const secretKey = (handle: string) =>
      credentialKey(
        'botharness-private',
        'remote-host-' + createHash('sha256').update(handle).digest('hex').slice(0, 40),
      );
    const store = () => {
      const credentials = options.credentials?.();
      if (!credentials) throw new Error('custody-storage-unavailable');
      return credentials;
    };
    const custody = createRemoteCustody({
      database: attachOperationalModule(options.database, 'remote-host-custody'),
      secrets: {
        read: async (handle) => {
          const record = await store().readRecord(secretKey(handle));
          return record?.kind === 'grant' ? record.payload : undefined;
        },
        write: async (handle, secret) => {
          await store().modifyRecord(secretKey(handle), async () => ({
            kind: 'grant',
            payload: secret,
          }));
        },
        delete: (handle) => store().deleteRecord(secretKey(handle)),
      },
      ownerHumanId: () => (options.team?.ownerContext() ?? OWNER_HUMAN_CONTEXT).humanId,
      carrier: nodeDeviceCarrier,
    });
    const offs = [
      connection.fetch.register({
        path: REMOTE_CUSTODY_PATH,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: createRemoteCustodyHttp(custody),
      }),
      connection.fetch.register({
        path: REMOTE_CUSTODY_STREAM_PATH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: createRemoteCustodyStream(custody),
      }),
    ];
    return async () => {
      custody.close();
      for (const off of offs) await off();
    };
  }, 'botharness: Remote Host credentials kept by the local Host');
}
