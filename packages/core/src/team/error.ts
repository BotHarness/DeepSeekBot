export class TeamError extends Error {
  constructor(
    readonly code: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}
