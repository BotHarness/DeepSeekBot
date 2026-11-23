import type { SessionModelChoice } from '@botharness/host-protocol/session-model';
import type { TurnTargetSwitchReason } from '@botharness/host-protocol/turn-target';
import type {
  AssignmentActivity,
  AssignmentReport,
  AssignmentReportInput,
} from '@botharness/host-protocol/wire';
import type {
  AssignmentReportRead,
  AcceptedAssignmentReportPage,
} from '../../runtime/assignment-report-reader.js';
import { type AssignmentExecutionWait } from '../../runtime/assignment-approval-capacity.js';
import type { AssignmentWaitOutcome } from '../../runtime/assignment-wait.js';
import { type PersonaBotRecord } from '../../bots/persona-bot.js';
import type { ModelRoute } from '../../models/presets.js';
import type { PresetSubEngineSelection } from '../../models/preset-sub.js';
import type { RoutingTarget } from '../../models/routing-groups.js';
import type { AssignmentPermissionSnapshot, WorkspaceGrant } from '../../workspaces/grants.js';
import type { OrchestratorAgentRun, InterruptedToolCall } from '../sessions/agent-run-types.js';

export type AssignmentRequestMode = 'next-step' | 'next-turn';

export interface AssignmentOpenAsk {
  sourceEventId: string;
  summary: string;
  at: string;
}

export interface AssignmentSummary {
  sessionId: string;
  title: string;
  description: string;
  activity: AssignmentActivity;
  executionWait?: AssignmentExecutionWait;
  latestReport?: AssignmentReport;
  continuityKey?: string;
  openAsk?: AssignmentOpenAsk;
  permission?: AssignmentPermissionSnapshot;
  modelRoute?: ModelRoute;
  modelGroupId?: string;
  modelGroupEffort?: string;
  agentPreset?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentDirectoryQuery {
  query?: string;
  activity?: AssignmentActivity[];
  includeArchived?: boolean;
  limit?: number;
  cursor?: string;
}

export interface AssignmentDirectoryPage {
  assignments: AssignmentSummary[];
  nextCursor?: string;
}

export type AssignmentArchiveOutcome =
  | { outcome: 'archived'; assignment: AssignmentSummary }
  | {
      outcome: 'refused';
      code: 'assignment-active';
      assignment: AssignmentSummary;
      message: string;
    };

export interface AssignmentDetail extends AssignmentSummary {
  botSlug: string;
  sourceEventId: string;
}

export interface AssignmentEventTail {
  events: Array<{
    seq: number;
    type: string;
    text: string;
    truncated: boolean;
  }>;
  indexedEvents: number;
  readCount: number;
  sourceEventBytes: number;
  returnedCharacters: number;
  estimatedTokens: number;
}

export interface AssignmentCapacityRefusal {
  outcome: 'capacity';
  code: 'assignment-capacity';
  activeCount: number;
  limit: number;
  retryable: true;
  message: string;
}

export type AssignmentCreateOutcome =
  | { outcome: 'created'; assignment: AssignmentSummary }
  | { outcome: 'reused'; assignment: AssignmentSummary }
  | { outcome: 'key-busy'; message: string }
  | AssignmentCapacityRefusal;

export type AssignmentRequestOutcome =
  | {
      assignment: AssignmentSummary;
      delivery: 'steer' | 'followup';
      acceptance?: 'accepted' | 'pending';
    }
  | (AssignmentCapacityRefusal & {
      assignment: AssignmentSummary;
      delivery: 'capacity';
    })
  | AssignmentEndedRefusal;

export interface AssignmentEndedRefusal {
  outcome: 'refused';
  code: 'assignment-ended';
  assignment: AssignmentSummary;
  delivery: 'refused';
  message: string;
}

export interface OrchestratorAssignmentAccess {
  wait?(sessionId: string, signal: AbortSignal, timeoutMs?: number): Promise<AssignmentWaitOutcome>;
  create(input: {
    title: string;
    description: string;
    instructions?: string;
    key?: string;
    grantId: string;
    model?: ModelRoute;
    engine?: PresetSubEngineSelection;
    engineEffort?: string;
    modelGroupId?: string;
    routingTarget?: RoutingTarget;
    modelGroupEffort?: string;
    mode?: string;
  }): AssignmentCreateOutcome;
  refreshRoute?(sessionId: string): Promise<unknown>;
  grants(): WorkspaceGrant[];
  list(): AssignmentSummary[];
  inspect(sessionId: string): AssignmentDetail | undefined;
  tail?(sessionId: string): Promise<AssignmentEventTail>;
  reportPage?(request: AssignmentReportRead): Promise<AcceptedAssignmentReportPage>;
  request(input: {
    sessionId: string;
    mode: AssignmentRequestMode;
    text: string;
    answerTo?: string;
    model?: ModelRoute;
  }): AssignmentRequestOutcome;
  stop(sessionId: string): Promise<AssignmentSummary>;
  query?(input: AssignmentDirectoryQuery): AssignmentDirectoryPage;
  archive?(sessionId: string): Promise<AssignmentArchiveOutcome>;
  unarchive?(sessionId: string): Promise<{ outcome: 'unarchived'; assignment: AssignmentSummary }>;
}

export interface AssignmentAgentRun {
  observeTurnTarget?: OrchestratorAgentRun['observeTurnTarget'];
  switchReason?: TurnTargetSwitchReason;
  groupSwitchReason?(): TurnTargetSwitchReason | undefined;
  sessionModel?(): {
    choice: SessionModelChoice | null;
    apply(run: AssignmentAgentRun): AssignmentAgentRun;
    finish(): void;
  };
  beginTurn?(): void;
  acceptNativeInput?: () => boolean;
  setExecutionReady?(ready: boolean): void;
  requireContent?(): void;
  accepted?(): void;
  toolsInterrupted?(calls: InterruptedToolCall[]): void;
  sessionId: string;
  bot: PersonaBotRecord;
  text: string;

  resume?: boolean;
  permission: AssignmentPermissionSnapshot;
  recoveryEntry?(): Pick<AssignmentDetail, 'title' | 'description'> | undefined;
  failEngineRecovery?(summary: string): Promise<AssignmentReport>;
  modelRoute?: ModelRoute;
  routingTarget?: RoutingTarget;
  groupEffort?: string;
  continueInitialGroupTurn?: true;
  continuingFromNativeRoute?: true;
  selectGroupTarget?(
    attempted: ReadonlySet<string>,
    error?: unknown,
  ): Promise<RoutingTarget | undefined>;
  agentPreset?: string;
  report(input: AssignmentReportInput, execution?: { turn: number }): Promise<AssignmentReport>;
  completedTurn?(execution: { turn: number; endSeq: number }): void;
  cancelledTurn?(execution: { turn: number; endSeq: number }): void;
  failedTurn?(execution: { turn: number; endSeq: number }): void;
}

export type AssignmentRequestDelivery =
  | { delivery: 'steer' }
  | { delivery: 'followup'; accepted: Promise<void>; done: Promise<void> };

export const DEFAULT_ASSIGNMENT_CONCURRENCY_LIMIT = 8;
