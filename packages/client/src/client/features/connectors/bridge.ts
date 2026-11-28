export type ConnectorAccess = 'read' | 'write';
export type ConnectorStatus = 'pending' | 'active' | 'expired' | 'failed';

export interface ConnectorAccountRecord {
  accountId: string;
  provider: 'composio' | 'mcp';
  service: string;
  label: string;
  identity?: string;
  status: ConnectorStatus;
  access?: ConnectorAccess;
  holderSlug?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorsView {
  configured: boolean;
  accounts: Array<
    ConnectorAccountRecord & {
      name: string;
      grants: Array<{ botSlug: string; botName?: string; access: ConnectorAccess }>;
    }
  >;
  catalog: ReadonlyArray<{
    service: string;
    name: string;
    summary: string;
    keywords?: readonly string[];
  }>;
}

export interface ConnectorApp {
  service: string;
  name: string;
  summary: string;
  featured: boolean;
}

export interface ConnectorAppSearch {
  apps: ConnectorApp[];
  next?: string;
  total?: number;
  source: 'composio' | 'featured';
  offline?: true;
}

export interface McpApp {
  service: string;
  name: string;
  summary: string;
  url: string;
  featured: boolean;
  website?: string;
}

export interface McpAppSearch {
  apps: McpApp[];
  next?: string;
  offline?: true;
}

export interface BotConnector {
  accountId: string;
  provider?: 'composio' | 'mcp';
  service: string;
  label: string;
  identity?: string;
  status: ConnectorStatus;
  access: ConnectorAccess;
}

import type { InvokeAction } from '../../actions.js';
import type { ConnectorRequestChoice } from '@botharness/host-client/shared/connector-request';
import {
  decideConnectorRequestCall,
  readBotConnectors,
  readConnectors,
  writeConnectorGrant,
} from '@botharness/host-client/connectors';

export interface OnceGrant {
  accountId: string;
  access: ConnectorAccess;
}

export interface ConnectorActions {
  connectors?(): Promise<ConnectorsView>;
  connectorKeySet?(apiKey: string): Promise<ConnectorsView>;
  connectorKeyClear?(): Promise<ConnectorsView>;
  connectorConnect?(
    service: string,
    label?: string,
  ): Promise<{ account: ConnectorAccountRecord; url?: string }>;
  connectorReconnect?(
    accountId: string,
  ): Promise<{ account: ConnectorAccountRecord; url?: string }>;
  connectorRefresh?(): Promise<ConnectorsView>;
  connectorSearch?(query: string, cursor?: string): Promise<ConnectorAppSearch>;
  connectorLogos?(services: string[]): Promise<{ logos: Record<string, string> }>;
  connectorMcpSearch?(query: string, cursor?: string): Promise<McpAppSearch>;
  connectorMcpAdd?(input: {
    url: string;
    name?: string;
    label?: string;
  }): Promise<{ account: ConnectorAccountRecord; url?: string }>;
  connectorGrantSet?(
    slug: string,
    accountId: string,
    access: ConnectorAccess | null,
  ): Promise<{ changed: boolean; connectors: BotConnector[]; once?: OnceGrant[] }>;
  connectorAccountRemove?(accountId: string): Promise<{ removed: boolean }>;
  botConnectors?(slug: string): Promise<{ connectors: BotConnector[]; once?: OnceGrant[] }>;
  connectorRequestDecide?(
    channelId: string,
    messageId: string,
    choice: ConnectorRequestChoice,
  ): Promise<{ accepted: boolean }>;
}

export function createConnectorActions(invoke: InvokeAction) {
  const host = {
    call: (method: string, args?: Record<string, unknown>) => invoke(method, args ?? {}),
  };
  return {
    connectors: () => readConnectors(host) as Promise<ConnectorsView>,
    connectorKeySet: (apiKey) => invoke('connectorKeySet', { apiKey }),
    connectorKeyClear: () => invoke('connectorKeyClear', {}),
    connectorConnect: (service, label) =>
      invoke('connectorConnect', label === undefined ? { service } : { service, label }),
    connectorReconnect: (accountId) => invoke('connectorReconnect', { accountId }),
    connectorRefresh: () => invoke('connectorRefresh', {}),
    connectorSearch: (query, cursor) =>
      invoke('connectorSearch', cursor === undefined ? { query } : { query, cursor }),
    connectorLogos: (services) => invoke('connectorLogos', { services }),
    connectorMcpSearch: (query, cursor) =>
      invoke('connectorMcpSearch', cursor === undefined ? { query } : { query, cursor }),
    connectorMcpAdd: (input) => invoke('connectorMcpAdd', input),
    connectorGrantSet: (slug, accountId, access) =>
      writeConnectorGrant(host, slug, accountId, access) as Promise<{
        changed: boolean;
        connectors: BotConnector[];
        once?: OnceGrant[];
      }>,
    connectorAccountRemove: (accountId) => invoke('connectorAccountRemove', { accountId }),
    botConnectors: (slug) =>
      readBotConnectors(host, slug) as Promise<{ connectors: BotConnector[]; once?: OnceGrant[] }>,
    connectorRequestDecide: (channelId, messageId, choice) =>
      decideConnectorRequestCall(host, channelId, messageId, choice),
  } satisfies Required<ConnectorActions>;
}
