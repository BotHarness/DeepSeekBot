export type ConnectorAccess = 'read' | 'write';
export type ConnectorStatus = 'pending' | 'active' | 'expired' | 'failed';
export type ConnectorProvider = 'composio' | 'mcp' | 'google';

export const GOOGLE_SERVICE = 'google_workspace';

export interface GoogleSetup {
  configured: boolean;
  redirectUri?: string;
  oauthClientType: 'web';
  browserLocation: 'host';
  apis: ReadonlyArray<{ id: string; name: string }>;
  limits: {
    testingRefreshTokenDays: number;
    unverifiedExternalUserCap: number;
    internalWorkspaceOnly: boolean;
  };
}

export interface ConnectorAccountRecord {
  accountId: string;
  provider: ConnectorProvider;
  service: string;
  label: string;
  identity?: string;
  status: ConnectorStatus;
  access?: ConnectorAccess;
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
  provider?: ConnectorProvider;
  service: string;
  label: string;
  identity?: string;
  status: ConnectorStatus;
  access: ConnectorAccess;
}

import type { InvokeAction } from '../../actions.js';

export interface ConnectorActions {
  connectors?(): Promise<ConnectorsView>;
  connectorGoogleSetup?(): Promise<GoogleSetup>;
  connectorGoogleAdd?(input: { clientId: string; clientSecret: string }): Promise<GoogleSetup>;
  connectorGoogleLogin?(label: string): Promise<{ account: ConnectorAccountRecord; url: string }>;
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
  ): Promise<{ changed: boolean; connectors: BotConnector[] }>;
  connectorAccountRemove?(accountId: string): Promise<{ removed: boolean }>;
  botConnectors?(slug: string): Promise<{ connectors: BotConnector[] }>;
}

export function createConnectorActions(invoke: InvokeAction) {
  return {
    connectors: () => invoke('connectors', {}),
    connectorGoogleSetup: () => invoke('connectorGoogleSetup', {}),
    connectorGoogleAdd: (input) => invoke('connectorGoogleAdd', { input }),
    connectorGoogleLogin: (label) => invoke('connectorGoogleLogin', { label }),
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
      invoke('connectorGrantSet', { slug, accountId, access }),
    connectorAccountRemove: (accountId) => invoke('connectorAccountRemove', { accountId }),
    botConnectors: (slug) => invoke('botConnectors', { slug }),
  } satisfies Required<ConnectorActions>;
}
