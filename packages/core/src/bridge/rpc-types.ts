import { type TeamService } from '../team/service.js';
import { type HumanContext } from '../humans/context.js';
import type {
  ChannelFilesPage,
  ChannelFilesRequest,
  ChannelChangeCursor,
  ChannelChanges,
  ChannelChangesRequest,
  ChannelJournalPage,
  ChannelJournalRequest,
} from '../channels/timeline.js';
import type { CompanionLiveFrame } from '../companions/live.js';
import {
  type ActivityLiveFrame,
  type ChannelLiveFrame,
  type DraftDelivery,
  type RosterLiveFrame,
} from '../channels/live.js';
import type { Context } from '@deepseek-ai/cordis';
import type { PrivateInputs } from '../credentials/private-inputs.js';
import type { BridgeMethods } from './methods.js';

export interface BridgeLive {
  followRoster(human: HumanContext, signal: AbortSignal): AsyncIterable<RosterLiveFrame>;
  followActivity(human: HumanContext, signal: AbortSignal): AsyncIterable<ActivityLiveFrame>;
  followChannel(
    human: HumanContext,
    channelId: string,
    limit: number,
    signal: AbortSignal,
    drafts?: DraftDelivery,
  ): AsyncIterable<ChannelLiveFrame>;
  journalPage(
    human: HumanContext,
    channelId: string,
    request: ChannelJournalRequest,
  ): ChannelJournalPage | undefined;
  filesPage(
    human: HumanContext,
    channelId: string,
    request: ChannelFilesRequest,
  ): ChannelFilesPage | undefined;
  changes(
    human: HumanContext,
    channelId: string,
    request: ChannelChangesRequest,
  ): ChannelChanges | undefined;
  changeCursor(human: HumanContext): ChannelChangeCursor | undefined;
  followCompanion(
    human: HumanContext,
    resume: string,
    lastEventId: string,
    signal: AbortSignal,
  ): AsyncIterable<CompanionLiveFrame>;
}

export interface BridgeRpcReceiver {
  readonly ctx: Context;
  readonly methods: BridgeMethods;
  readonly privateInputs?: PrivateInputs;
  readonly live?: BridgeLive;
  readonly team?: TeamService;
  invocationHuman(): HumanContext;
  requireApproval(channelId: string, messageId: string): HumanContext;
  requirePrivateOwner(message?: string): void;
}
