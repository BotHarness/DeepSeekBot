import type { DeviceConnect } from '../../devices/connect.js';
import type { createConnectBotNetwork } from '../../devices/connect-bot-network.js';
import type { ActivityProvider } from '../../live-activity/contract.js';
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { z } from 'zod';

export type Credentials = Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>;

export type AccountIssue =
  | 'relay-unavailable'
  | 'sign-in-denied'
  | 'sign-in-expired'
  | 'session-expired'
  | 'session-revoked'
  | 'account-not-allowed'
  | 'host-limit'
  | 'relay-full'
  | 'credential-unavailable';

export interface ConnectPool {
  capacity: number;
  inUse: number;
  free: number;
  waiting: number;
  nextFreeAt?: string | undefined;
  guaranteedMinutes?: number | undefined;
}

export interface ConnectWait {
  reason: 'pool-full' | 'zone-full' | 'queued';
  position: number;
  retryAfter: number;
  since: string;
}

export interface AccountStatus {
  state: 'signed-out' | 'signing-in' | 'signed-in' | 'error';
  email?: string;
  hostId?: string;
  userCode?: string;
  verificationUri?: string;
  expiresAt?: string;
  issue?: AccountIssue;
  recovery?: 'automatic' | 'sign-in';
  pool?: ConnectPool;
  wait?: ConnectWait;
  protectedUntil?: string;
}

export type AccountFailureCode =
  | AccountIssue
  | 'signed-out'
  | 'current-host'
  | 'host-not-found'
  | 'session-unknown'
  | 'invalid-host-id';

export type AccountResult =
  | { ok: true; status: AccountStatus; sessionKnown?: boolean; sessionRevoked?: boolean }
  | { ok: false; code: AccountFailureCode };

export interface ConnectedHost {
  botNetwork?: { hostId: string; publicKey: string };
  id: string;
  name: string;
  hostname: string;
  createdAt: string;
  connected?: boolean;
  current: boolean;
  sessionKnown: boolean;
}

export type ConnectedHostsResult =
  | { ok: true; hosts: ConnectedHost[] }
  | { ok: false; code: AccountFailureCode };

export type OfferVerification =
  | { ok: true; verifierHash: string; name?: string; accountAutoApprove?: true }
  | { ok: false };

export interface ConnectAccount {
  botNetwork: ReturnType<typeof createConnectBotNetwork>;
  activity: ActivityProvider;
  status(): AccountStatus;
  verifyOffer(body: string, signature: string | undefined): Promise<OfferVerification>;
  accessToken(options?: { fresh?: boolean }): Promise<string | undefined>;
  relationshipSession(): Promise<AccountRelationshipSession | undefined>;
  start(): Promise<void>;
  signIn(): Promise<AccountResult>;
  signOut(): Promise<AccountResult>;
  connectedHosts(signal?: AbortSignal): Promise<ConnectedHostsResult>;
  revokeConnectedHost(hostId: string): Promise<AccountResult>;
  close(): Promise<void>;
}

export const accountRelationshipOfferSchema = z.object({
  host: z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u), name: z.string().max(120) }),
  encryption: z.object({
    protocol: z.literal('connect-noise-xk-v1'),
    publicKey: z.string().regex(/^[a-f0-9]{64}$/u),
  }),
  enrollment: z.object({ body: z.string().max(4096), signature: z.string().max(128) }),
  hostname: z.string().max(253),
  expiresAt: z.iso.datetime(),
});
export type AccountRelationshipOffer = z.infer<typeof accountRelationshipOfferSchema>;
export interface AccountRelationshipSession {
  signal?: AbortSignal;
  generation: string;
  accountId: string;
  registrationId: string;
  current(): boolean;
  hosts(signal: AbortSignal): Promise<ConnectedHost[]>;
  offer(
    registrationId: string,
    verifierHash: string,
    signal: AbortSignal,
  ): Promise<AccountRelationshipOffer>;
}

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
