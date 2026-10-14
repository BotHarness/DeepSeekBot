import type {
  RemoteStreamClientMessage,
  RemoteStreamServerMessage,
} from '@deepseek-ai/dsh-api-gateway/stream-protocol';

import type {
  BridgeMethods,
  ChannelListItem as HostChannel,
  PersonaBotSummary as HostBot,
} from '../../../packages/core/src/bridge/methods.js';
import type { ChannelMessage as HostMessage } from '../../../packages/core/src/channels/channel.js';
import type { ChannelUserQuestions } from '../../../packages/core/src/channels/user-questions.js';
import type { ChannelTimelinePage as HostTimelinePage } from '../../../packages/core/src/channels/timeline.js';
import type {
  HumanAttentionItem as HostAttentionItem,
  HumanAttentionPage as HostAttentionPage,
} from '../../../packages/core/src/runtime/human-attention.js';
import type { ToolApprovalDecision as HostDecision } from '../../../packages/core/src/workspaces/tool-approval.js';
import type {
  ActivityLiveFrame as HostActivity,
  ChannelLiveFrame as HostChannelFrame,
  RosterLiveFrame as HostRoster,
} from '../../../packages/core/src/channels/live.js';
import type { ChannelSendStatus as HostSendStatus } from '../../../packages/core/src/channels/store.js';
import type { ChannelJournalPage as HostJournalPage } from '../../../packages/core/src/channels/timeline.js';
import type { AggregatedState as HostState } from '../../../packages/core/src/state/bot-state.js';
import type {
  ActivityLiveFrame,
  AggregatedState,
  BotScheduleSummary,
  MemoryFile,
  MemorySnapshot,
  WorkspaceGrantSummary,
  ChannelListItem,
  HumanAttentionItem,
  HumanAttentionPage,
  QuestionAnswer,
  TimelineMessage,
  TimelinePage,
  ToolApprovalOutcome,
  ToolApprovalStatus,
  UserQuestionStatus,
  ChannelLiveFrame,
  JournalPage,
  SendStatus,
  MuxClientFrame,
  MuxServerFrame,
  PersonaBotSummary,
  RosterLiveFrame,
} from '../src/host/wire.js';

type Assert<T extends true> = T;
type Accepts<App, Host> = [Host] extends [App] ? true : false;
type HostAnswer = Parameters<ChannelUserQuestions['answer']>[2];
type Value<Method extends keyof BridgeMethods> = Extract<
  Awaited<ReturnType<BridgeMethods[Method]>>,
  { ok: true }
>['value'];

export type WireContract = [
  Assert<Accepts<PersonaBotSummary, HostBot>>,
  Assert<Accepts<ChannelListItem, HostChannel>>,
  Assert<Accepts<RosterLiveFrame, HostRoster>>,
  Assert<Accepts<ActivityLiveFrame, HostActivity>>,
  Assert<Accepts<ChannelLiveFrame, HostChannelFrame>>,
  Assert<Accepts<JournalPage, HostJournalPage>>,
  Assert<Accepts<SendStatus, HostSendStatus>>,
  Assert<Accepts<AggregatedState, HostState>>,
  Assert<Accepts<HostState, AggregatedState>>,
  Assert<Accepts<MuxServerFrame, RemoteStreamServerMessage>>,
  Assert<Accepts<RemoteStreamClientMessage, MuxClientFrame>>,
  Assert<Accepts<HumanAttentionItem, HostAttentionItem>>,
  Assert<Accepts<HumanAttentionPage, HostAttentionPage>>,
  Assert<Accepts<HumanAttentionPage, Value<'humanAttention'>>>,
  Assert<Accepts<TimelineMessage, HostMessage>>,
  Assert<Accepts<TimelinePage, HostTimelinePage>>,
  Assert<Accepts<TimelinePage, Value<'channelTimeline'>['page']>>,
  Assert<Accepts<ToolApprovalOutcome, HostDecision['outcome']>>,
  Assert<Accepts<HostDecision['outcome'], ToolApprovalOutcome>>,
  Assert<Accepts<ToolApprovalStatus, Value<'toolApprovalStatus'>['status']>>,
  Assert<Accepts<UserQuestionStatus, Value<'userQuestionStatus'>['status']>>,
  Assert<Accepts<HostAnswer, QuestionAnswer>>,
  Assert<Accepts<MemorySnapshot, Value<'memorySnapshot'>['snapshot']>>,
  Assert<Accepts<MemoryFile | undefined, Value<'memoryFile'>['file']>>,
  Assert<Accepts<BotScheduleSummary, Value<'scheduleList'>['schedules'][number]>>,
  Assert<Accepts<WorkspaceGrantSummary, Value<'grants'>['grants'][number]>>,
];
