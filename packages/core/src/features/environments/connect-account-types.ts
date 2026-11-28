import type { DeviceConnect } from '../../devices/connect.js';
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { z } from 'zod';

export type Credentials = Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>;

export { accountRelationshipOfferSchema } from '../../devices/connect-account.js';
export type {
  ConnectedHost,
  AccountIssue,
  ConnectPool,
  ConnectWait,
  AccountStatus,
  AccountFailureCode,
  AccountResult,
  ConnectedHostsResult,
  OfferVerification,
  ConnectAccount,
  AccountRelationshipOffer,
  AccountRelationshipSession,
} from '../../devices/connect-account.js';

export const relaySchema = z.string().url().brand<'ConnectRelay'>();
export const clientIdSchema = z
  .string()
  .regex(/^client_[A-Za-z0-9]+$/u)
  .brand<'ConnectClientId'>();
export const hostIdSchema = z.string().min(1).brand<'ConnectHostId'>();
const registrationSchema = z.object({
  kind: z.literal('registration').default('registration'),
  relay: relaySchema,
  clientId: clientIdSchema,
  hostId: hostIdSchema,
});
const sessionSchema = registrationSchema.omit({ hostId: true }).extend({
  kind: z.literal('session').default('session'),
  refreshToken: z.string(),
  email: z.string().optional(),
  hostId: hostIdSchema.optional(),
  account: z.string().optional(),
  relayKey: z.string().optional(),
});
export const storedAccountSchema = z.union([sessionSchema, registrationSchema]);
export const hostListSchema = z.object({ hosts: z.array(z.object({ id: hostIdSchema })) });
export const connectedHostsSchema = z.object({
  hosts: z.array(
    z.object({
      id: hostIdSchema,
      name: z.string(),
      hostname: z.string(),
      createdAt: z.string(),
      connected: z.boolean().optional(),
      sessionKnown: z.boolean().default(false),
      botNetwork: z
        .object({ hostId: z.string().min(1), publicKey: z.string().regex(/^[a-f0-9]{64}$/u) })
        .optional(),
    }),
  ),
});
export const revokedHostSchema = z.object({
  deleted: z.literal(true),
  sessionKnown: z.boolean(),
  sessionRevoked: z.boolean(),
});
export type AccountRecord = z.infer<typeof sessionSchema>;
export type StoredAccount = z.infer<typeof storedAccountSchema>;
export type ConnectClientId = z.infer<typeof clientIdSchema>;

export interface ConnectAccountOptions {
  credentials: () => Credentials | undefined;
  connect: DeviceConnect;
  relay?: string;
  fetch?: typeof fetch;
  hostName?: () => string;
  freePort?: () => Promise<number>;
  sleep?: (ms: number) => Promise<void>;
  watchMs?: number;
  record?: (phase: string, detail?: string) => void;
  onReady?: () => void;
  onAccountChanged?: () => void;
}
