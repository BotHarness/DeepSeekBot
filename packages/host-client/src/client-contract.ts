import type { HostCarrier } from '@botharness/host-protocol/carrier';
import type {
  AggregatedState,
  AttachmentRef,
  ChannelListItem,
  RosterResourceChange,
  WireAuthor,
  WireBotActivity,
  WireSessionActivity,
  WireToolActivity,
} from '@botharness/host-protocol/wire';
import type { BotPrimaryColor } from '../../core/src/bots/primary-color';
import type { ChannelVoiceCallRecord } from '../../core/src/channels/voice-call-record';
import type { DeviceRefusal } from './client-errors';
import type { HostEncryption } from './hosts';
import type { LocalStore } from './local-store';
import type { HostMemberIdentity } from './member-identity';
import type { RosterSorting } from './roster-sorting';
import type { ConnectionTelemetry } from './telemetry/connection';

export type ConnectionState =
  | { status: 'connecting'; route: string }
  | { status: 'connected'; route: string }
  | { status: 'reconnecting'; route: string; attempt: number }
  | {
      status: 'unreachable';
      route: string;
      attempt: number;
      reason: string;
      retryDelay?: number;
    }
  | { status: 'refused'; route: string; code: DeviceRefusal; reason: string }
  | { status: 'stopped'; route: string };

export interface RosterBot {
  tob?: boolean;
  slug: string;
  displayName: string;
  avatarUrl?: string;
  avatarHeaders?: Record<string, string>;
  appearance?: unknown;
  avatarSeed?: 2;
  bannerRecipe?: { scene: string; seed: number };
  bannerUrl?: string;
  bannerHeaders?: Record<string, string>;
  primaryColor?: BotPrimaryColor;
  roles: string[];
  description?: string;
  computerAccess: boolean;
  browserAccess: boolean;
  hostAccess?: { computer: boolean; browser: boolean };
  state: AggregatedState;
  activity?: WireToolActivity;
  sessions?: readonly WireSessionActivity[];
  paused: boolean;
  dmChannelId?: string;
  preview?: string;
  previewCall?: ChannelVoiceCallRecord;
  previewAt?: string;
  latestMessageId?: string;
  previewAuthor?: WireAuthor;
}

export interface RosterHuman {
  humanId: string;
  displayName: string;
  avatarVersion?: string;
}

export interface RosterChannel {
  id: string;
  name: string;
  memberCount: number;
  members: string[];
  humanMembers?: RosterHuman[];
  avatar?: string;
  ownerBotSlug?: string;
  pendingInvites?: Array<{ id: string; botSlug: string }>;
  pendingJoins?: Array<{ id: string; botSlug: string }>;
  preview?: string;
  previewCall?: ChannelVoiceCallRecord;
  previewAt?: string;
  latestMessageId?: string;
  previewAuthor?: WireAuthor;
}

export interface RosterSection {
  id: string;
  name: string;
  channelIds: string[];
}

export interface TopOrderEntry {
  kind: 'section' | 'channel';
  id: string;
}

export interface RosterArrangement {
  pins: string[];
  hidden: string[];
  muted?: string[];
  sections: RosterSection[];
  sectionOrder: string[];
  topOrder?: TopOrderEntry[];
}

export interface RosterView {
  bots: RosterBot[];
  channels: RosterChannel[];
  people?: RosterChannel[];
  activityChannels?: ChannelListItem[];
  arrangement?: RosterArrangement;
  sorting?: RosterSorting;
}

export interface HostCompatibility {
  hostVersion?: string;
  update?: 'host' | 'app';
}

export interface HostSnapshot {
  routePreference?: string;
  routeChangePending?: boolean;
  feedRead?: 'acknowledged' | 'unsupported' | 'unconfirmed';
  routes?: readonly {
    url: string;
    status: 'unchecked' | 'verified' | 'unreachable';
  }[];
  computerAvailable?: boolean;
  compatibility?: HostCompatibility;
  connection: ConnectionState;
  disruptedSince?: number;
  activity?: readonly WireBotActivity[];
  roster?: RosterView;
}

export interface RemoteSource {
  read?: (signal: AbortSignal) => Promise<{ bytes: Uint8Array; mime: string }>;
  uri: string;
  headers: Record<string, string>;
  cacheKey?: string;
  scope?: string;
}

export interface StreamHandlers {
  item(value: unknown): void;
  interrupted(reason: string): void;
  refused(error: { code: string; message: string }): void;
}

export interface HostClient {
  setRoutePreference?(route: string | undefined): Promise<void>;
  updateRoutes?(
    routes: string[],
    encryption?: HostEncryption,
    saved?: { routePreference: string | undefined },
  ): void;
  testRoute?(url: string): Promise<boolean>;
  getSnapshot(): HostSnapshot;
  subscribe(listener: () => void): () => void;
  start(): void;
  stop(): void;
  retryNow(trigger?: 'resume' | 'manual_retry', options?: { preserveConnected?: boolean }): void;
  refresh(): Promise<void>;
  call<T>(
    method: string,
    args?: Record<string, unknown>,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<T>;
  upload(name: string, data: Blob): Promise<AttachmentRef>;
  api(path: string, init?: HostApiInit): Promise<HostApiAnswer>;
  resource(path: string): RemoteSource;
  secretInputAllowed?(): boolean;
  onLive(listener: (source: 'roster' | 'activity') => void): () => void;
  onPurged?(listener: (placements: unknown) => void): () => void;
  onSkills?(listener: (channelIds: readonly string[]) => void): () => void;
  onResource?(
    listener: (resource: string | undefined, change?: RosterResourceChange) => void,
  ): () => void;
  follow(endpoint: string, args: Record<string, unknown>, handlers: StreamHandlers): () => void;
}

export interface HostApiInit {
  response?: 'bytes';
  body?: Record<string, unknown>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface HostApiAnswer {
  status: number;
  body: unknown;
}

export interface HostClientOptions {
  member?: HostMemberIdentity;
  routePreference?: string;
  onRoutePreferenceChanged?: (route: string | undefined) => Promise<void>;
  onRoutesChanged?: (routes: string[]) => Promise<void>;
  onPurged?: (placements: unknown) => void;
  hostId?: string;
  encryption?: HostEncryption;
  telemetry?: ConnectionTelemetry;
  routes: string[];
  credential: string;
  carrier: HostCarrier;
  backoff?: (attempt: number) => number;
  timeoutMs?: number;
  localStore?: () => Promise<LocalStore | undefined>;
  appVersion?: string;
}
