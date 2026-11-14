export class TeamError extends Error {
  constructor(
    readonly code: string,
    readonly retryAfterSeconds?: number,
    readonly details?: { permission: string },
  ) {
    super(code);
  }
}
