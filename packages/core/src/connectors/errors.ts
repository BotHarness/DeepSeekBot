export type ConnectorErrorCode =
  | 'not-configured'
  | 'invalid'
  | 'not-found'
  | 'credential-unavailable'
  | 'upstream';

export class ConnectorError extends Error {
  constructor(
    readonly code: ConnectorErrorCode,
    message: string,
  ) {
    super(message);
  }
}
