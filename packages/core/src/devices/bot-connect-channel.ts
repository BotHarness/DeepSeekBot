import { z } from 'zod';
import type { ConnectBotMembership } from '../channels/channel.js';
import { createBotPeerChannel } from './bot-peer-channel.js';
import type {
  createConnectBotNetwork,
  ConnectBotPeer,
  AuthenticatedConnectBotPeer,
} from './connect-bot-network.js';

export const BOT_CONNECT_PATH = '/botharness-device/bots/v1';
const grant = z
  .object({
    payload: z.string().max(8192),
    signature: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  })
  .strict();

export function createBotConnectChannel(options: {
  hostId: string;
  key(): Promise<Uint8Array>;
  account: Pick<ReturnType<typeof createConnectBotNetwork>, 'grant' | 'verify' | 'membership'>;
  receive(peer: AuthenticatedConnectBotPeer, payload: unknown): Promise<unknown>;
  record?(event: { phase: string; durationMs: number; code?: string }): void;
  fetch?: typeof fetch;
}) {
  return createBotPeerChannel({
    ...options,
    path: BOT_CONNECT_PATH,
    logPrefix: 'connect',
    origin: (peer: ConnectBotPeer & { membership?: ConnectBotMembership }) =>
      `https://${peer.hostname}`,
    parseGrant: (value) => grant.parse(value),
    grant: (identity, peer) => options.account.grant(identity, peer),
    verify: (identity, value) => options.account.verify(identity, value),
    current: async (peer) =>
      peer.membership === undefined ||
      (await options.account.membership(peer.hostId, peer.membership, peer.publicKey)) === 'member',
  });
}
