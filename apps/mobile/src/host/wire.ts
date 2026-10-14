export type AggregatedState = 'idle' | 'thinking' | 'working' | 'waiting' | 'blocked';

export interface WireMessage {
  id: string;
  at: string;
  body: string;
}

export interface PersonaBotSummary {
  slug: string;
  displayName: string;
  avatar?: string;
  appearance?: unknown;
  avatarSeed?: 2;
  paused?: boolean;
  deleted?: boolean;
  aggregateState: AggregatedState;
}

export interface ChannelListItem {
  id: string;
  type: 'dm' | 'group' | (string & {});
  name: string;
  members: string[];
  botSlug?: string;
  deletedAt?: string;
  latestMessage?: WireMessage;
}

export type RosterLiveFrame =
  | { type: 'baseline'; placements: unknown[] }
  | { type: 'changed' }
  | { type: 'latest'; channelId: string; message: WireMessage }
  | { type: 'purged'; placements: unknown[] };

export interface ActivitySnapshot {
  generation: string;
  revision: number;
  bots: readonly { slug: string; state: AggregatedState }[];
}

export type ActivityLiveFrame =
  | { type: 'baseline'; snapshot: ActivitySnapshot }
  | { type: 'changed'; snapshot: ActivitySnapshot };

export interface ClientRequest {
  type: 'client-request';
  rpcId: string;
  method: string;
  payload: { args: Record<string, unknown> };
}

export type MuxClientFrame =
  | { type: 'open'; streamId: string; endpoint: string; payload: { args: Record<string, unknown> } }
  | { type: 'cancel'; streamId: string };

export type MuxServerFrame =
  | { type: 'item'; streamId: string; value?: unknown }
  | {
      type: 'error';
      streamId: string;
      error: { code: string; message: string; details: object };
    }
  | { type: 'end'; streamId: string };

export const REMOTE_STREAM_MUX_PATH = '/api/remote.mux';
