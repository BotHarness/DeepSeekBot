export interface HandleDmMessageInput {
  channelId: string;
  messageId: string;
  body: string;
}

export type DmAdmissionFailure =
  | 'runtime-closed'
  | 'unknown-channel'
  | 'not-dm'
  | 'unknown-bot'
  | 'archived-bot'
  | 'blank-body'
  | 'cli-request-expired';

export type OrchestratorMessageOutcome =
  | { delivered: true; sourceEventId: string; settled: Promise<void> }
  | {
      delivered: false;
      reason: DmAdmissionFailure | 'not-current-orchestrator';
    };

export type DmMessageAdmission =
  | { admitted: true; settled: Promise<void> }
  | { admitted: false; reason: DmAdmissionFailure };
