export type ConnectorErrorCode =
  | 'not-configured'
  | 'invalid'
  | 'not-found'
  | 'credential-unavailable'
  | 'upstream'
  | 'read-only-unsupported';

export class ConnectorError extends Error {
  constructor(
    readonly code: ConnectorErrorCode,
    message: string,
  ) {
    super(message);
  }
}
