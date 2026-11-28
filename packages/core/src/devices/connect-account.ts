import type { ActivityProvider } from '../live-activity/contract.js';
import type { createConnectBotNetwork } from './connect-bot-network.js';
import { z } from 'zod';

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
