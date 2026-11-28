export interface ConnectorRequestView {
  service: string;
  name: string;
  access: 'read' | 'write';
  reason: string;
  account?: { accountId: string; label: string; identity?: string; holder: 'shared' | 'bot' };
}

export type ConnectorRequestChoice = 'persistent' | 'once' | 'deny';

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function parseConnectorRequest(value: unknown): ConnectorRequestView | undefined {
  const source = record(value);
  if (
    source === undefined ||
    typeof source['service'] !== 'string' ||
    typeof source['name'] !== 'string' ||
    typeof source['reason'] !== 'string' ||
    (source['access'] !== 'read' && source['access'] !== 'write')
  )
    return undefined;
  const account = record(source['account']);
  const holder = account?.['holder'];
  const parsedAccount: ConnectorRequestView['account'] =
    account !== undefined &&
    typeof account['accountId'] === 'string' &&
    typeof account['label'] === 'string' &&
    (holder === 'shared' || holder === 'bot')
      ? {
          accountId: account['accountId'],
          label: account['label'],
          ...(typeof account['identity'] === 'string' ? { identity: account['identity'] } : {}),
          holder,
        }
      : undefined;
  return {
    service: source['service'],
    name: source['name'],
    access: source['access'],
    reason: source['reason'],
    ...(parsedAccount === undefined ? {} : { account: parsedAccount }),
  };
}
