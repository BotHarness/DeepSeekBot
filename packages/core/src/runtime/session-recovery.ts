export type SessionRecoveryAction = 'compact' | 'new-session';

export class SessionRecoveryError extends Error {
  constructor(
    readonly code:
      | 'bot-busy'
      | 'session-changed'
      | 'retry-unavailable'
      | 'compaction-failed'
      | 'session-unsaved'
      | 'recovery-unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'SessionRecoveryError';
  }
}
