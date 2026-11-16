export class TeamError extends Error {
  constructor(
    readonly code: string,
    readonly retryAfterSeconds?: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}
