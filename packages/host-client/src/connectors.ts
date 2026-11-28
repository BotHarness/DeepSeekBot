import type { HostCall } from './host-answer';
import type { ConnectorRequestChoice } from './shared/connector-request';

export type ConnectorAccess = 'read' | 'write';

export interface BotConnectorAccount {
  accountId: string;
  service: string;
  name: string;
  label: string;
  identity?: string;
  active: boolean;
  own: boolean;
  access?: ConnectorAccess;
  once?: ConnectorAccess;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function grants(value: unknown, key: string): Map<string, ConnectorAccess> {
  const list = record(value)[key];
  const found = new Map<string, ConnectorAccess>();
  if (!Array.isArray(list)) return found;
  for (const entry of list) {
    const { accountId, access } = record(entry);
    if (typeof accountId === 'string' && (access === 'read' || access === 'write'))
      found.set(accountId, access);
  }
  return found;
}

function accountsFor(botSlug: string, view: unknown, granted: unknown): BotConnectorAccount[] {
  const persistent = grants(granted, 'connectors');
  const once = grants(granted, 'once');
  const accounts = record(view)['accounts'];
  if (!Array.isArray(accounts)) return [];
  return accounts.flatMap((entry): BotConnectorAccount[] => {
    const account = record(entry);
    const accountId = account['accountId'];
    const service = account['service'];
    const label = account['label'];
    const holder = account['holderSlug'];
    if (typeof accountId !== 'string' || typeof service !== 'string' || typeof label !== 'string')
      return [];
    if (typeof holder === 'string' && holder !== botSlug) return [];
    const access = persistent.get(accountId);
    const temporary = access === undefined ? once.get(accountId) : undefined;
    return [
      {
        accountId,
        service,
        name: typeof account['name'] === 'string' ? account['name'] : service,
        label,
        ...(typeof account['identity'] === 'string' ? { identity: account['identity'] } : {}),
        active: account['status'] === 'active',
        own: holder === botSlug,
        ...(access === undefined ? {} : { access }),
        ...(temporary === undefined ? {} : { once: temporary }),
      },
    ];
  });
}

export function readConnectors(host: HostCall): Promise<unknown> {
  return host.call('connectors', {});
}

export function readBotConnectors(host: HostCall, botSlug: string): Promise<unknown> {
  return host.call('botConnectors', { slug: botSlug });
}

export function writeConnectorGrant(
  host: HostCall,
  botSlug: string,
  accountId: string,
  access: ConnectorAccess | null,
): Promise<unknown> {
  return host.call('connectorGrantSet', { slug: botSlug, accountId, access });
}

export async function decideConnectorRequestCall(
  host: HostCall,
  channelId: string,
  messageId: string,
  choice: ConnectorRequestChoice,
): Promise<{ accepted: true }> {
  const value = await host.call('connectorRequestDecide', { channelId, messageId, choice });
  if (record(value)['accepted'] !== true)
    throw new Error('connectorRequestDecide was not accepted.');
  return { accepted: true };
}

export async function loadBotConnectors(
  host: HostCall,
  botSlug: string,
): Promise<BotConnectorAccount[]> {
  const [view, granted] = await Promise.all([
    readConnectors(host),
    readBotConnectors(host, botSlug),
  ]);
  return accountsFor(botSlug, view, granted);
}

export async function setBotConnector(
  host: HostCall,
  botSlug: string,
  accountId: string,
  access: ConnectorAccess | null,
): Promise<BotConnectorAccount[]> {
  const [granted, view] = await Promise.all([
    writeConnectorGrant(host, botSlug, accountId, access),
    readConnectors(host),
  ]);
  return accountsFor(botSlug, view, granted);
}
