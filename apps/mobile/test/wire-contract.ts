import type {
  RemoteStreamClientMessage,
  RemoteStreamServerMessage,
} from '@deepseek-ai/dsh-api-gateway/stream-protocol';

import type {
  ChannelListItem as HostChannel,
  PersonaBotSummary as HostBot,
} from '../../../packages/core/src/bridge/methods.js';
import type {
  ActivityLiveFrame as HostActivity,
  RosterLiveFrame as HostRoster,
} from '../../../packages/core/src/channels/live.js';
import type { AggregatedState as HostState } from '../../../packages/core/src/state/bot-state.js';
import type {
  ActivityLiveFrame,
  AggregatedState,
  ChannelListItem,
  MuxClientFrame,
  MuxServerFrame,
  PersonaBotSummary,
  RosterLiveFrame,
} from '../src/host/wire.js';

type Assert<T extends true> = T;
type Accepts<App, Host> = [Host] extends [App] ? true : false;

export type WireContract = [
  Assert<Accepts<PersonaBotSummary, HostBot>>,
  Assert<Accepts<ChannelListItem, HostChannel>>,
  Assert<Accepts<RosterLiveFrame, HostRoster>>,
  Assert<Accepts<ActivityLiveFrame, HostActivity>>,
  Assert<Accepts<AggregatedState, HostState>>,
  Assert<Accepts<HostState, AggregatedState>>,
  Assert<Accepts<MuxServerFrame, RemoteStreamServerMessage>>,
  Assert<Accepts<RemoteStreamClientMessage, MuxClientFrame>>,
];
