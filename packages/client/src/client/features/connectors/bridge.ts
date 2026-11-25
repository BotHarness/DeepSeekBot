export type ConnectorAccess = 'read' | 'write';
export type ConnectorStatus = 'pending' | 'active' | 'expired' | 'failed';

export interface ConnectorAccountRecord {
  accountId: string;
  provider: 'composio';
  service: string;
  label: string;
  identity?: string;
  status: ConnectorStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorsView {
  configured: boolean;
  accounts: Array<
    ConnectorAccountRecord & {
      name: string;
      grants: Array<{ botSlug: string; access: ConnectorAccess }>;
    }
  >;
  catalog: ReadonlyArray<{ service: string; name: string; summary: string }>;
}

export interface BotConnector {
  accountId: string;
  service: string;
  label: string;
  identity?: string;
  status: ConnectorStatus;
  access: ConnectorAccess;
}

import type { InvokeAction } from '../../actions.js';

export interface ConnectorActions {
  connectors?(): Promise<ConnectorsView>;
  connectorKeySet?(apiKey: string): Promise<ConnectorsView>;
  connectorKeyClear?(): Promise<ConnectorsView>;
  connectorConnect?(
    service: string,
    label?: string,
  ): Promise<{ account: ConnectorAccountRecord; url: string }>;
  connectorRefresh?(): Promise<ConnectorsView>;
  connectorGrantSet?(
    slug: string,
    accountId: string,
    access: ConnectorAccess | null,
  ): Promise<{ changed: boolean; connectors: BotConnector[] }>;
  connectorAccountRemove?(accountId: string): Promise<{ removed: boolean }>;
  botConnectors?(slug: string): Promise<{ connectors: BotConnector[] }>;
}

export function createConnectorActions(invoke: InvokeAction) {
  return {
    connectors: () => invoke('connectors', {}),
    connectorKeySet: (apiKey) => invoke('connectorKeySet', { apiKey }),
    connectorKeyClear: () => invoke('connectorKeyClear', {}),
    connectorConnect: (service, label) =>
      invoke('connectorConnect', label === undefined ? { service } : { service, label }),
    connectorRefresh: () => invoke('connectorRefresh', {}),
    connectorGrantSet: (slug, accountId, access) =>
      invoke('connectorGrantSet', { slug, accountId, access }),
    connectorAccountRemove: (accountId) => invoke('connectorAccountRemove', { accountId }),
    botConnectors: (slug) => invoke('botConnectors', { slug }),
  } satisfies Required<ConnectorActions>;
}
