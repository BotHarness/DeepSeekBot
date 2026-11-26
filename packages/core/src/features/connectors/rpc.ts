import { unwrap, unwrapAsync } from '../../kernel/rpc-result.js';
import type { BotConnector, ConnectorAppSearch, ConnectorsView } from '../../connectors/service.js';
import type { McpAppSearch } from '../../connectors/remote.js';
import type { ConnectorAccess, ConnectorAccountRecord } from '../../connectors/store.js';
import type { ConnectorsBridgeMethods } from './methods.js';

export const connectorsRpc = {
  connectors(): Promise<ConnectorsView> {
    return unwrapAsync(this.methods.connectors({}));
  },

  connectorKeySet(apiKey: string): Promise<ConnectorsView> {
    return unwrapAsync(this.methods.connectorKeySet({ apiKey }));
  },

  connectorKeyClear(): Promise<ConnectorsView> {
    return unwrapAsync(this.methods.connectorKeyClear({}));
  },

  connectorConnect(
    service: string,
    label?: string,
  ): Promise<{ account: ConnectorAccountRecord; url?: string }> {
    return unwrapAsync(this.methods.connectorConnect({ service, label }));
  },

  connectorReconnect(
    accountId: string,
  ): Promise<{ account: ConnectorAccountRecord; url?: string }> {
    return unwrapAsync(this.methods.connectorReconnect({ accountId }));
  },

  connectorRefresh(): Promise<ConnectorsView> {
    return unwrapAsync(this.methods.connectorRefresh({}));
  },

  connectorSearch(query: string, cursor?: string): Promise<ConnectorAppSearch> {
    return unwrapAsync(
      this.methods.connectorSearch(cursor === undefined ? { query } : { query, cursor }),
    );
  },

  connectorLogos(services: string[]): Promise<{ logos: Record<string, string> }> {
    return unwrapAsync(this.methods.connectorLogos({ services }));
  },

  connectorMcpSearch(query: string, cursor?: string): Promise<McpAppSearch> {
    return unwrapAsync(
      this.methods.connectorMcpSearch(cursor === undefined ? { query } : { query, cursor }),
    );
  },

  connectorMcpAdd(input: {
    url: string;
    name?: string;
    label?: string;
  }): Promise<{ account: ConnectorAccountRecord; url?: string }> {
    return unwrapAsync(this.methods.connectorMcpAdd(input));
  },

  connectorMcpFinish(url: string): Promise<{ account: ConnectorAccountRecord }> {
    return unwrapAsync(this.methods.connectorMcpFinish({ url }));
  },

  connectorGrantSet(
    slug: string,
    accountId: string,
    access: ConnectorAccess | null,
  ): { changed: boolean; connectors: BotConnector[] } {
    return unwrap(this.methods.connectorGrantSet({ slug, accountId, access }));
  },

  connectorAccountRemove(accountId: string): Promise<{ removed: boolean }> {
    return unwrapAsync(this.methods.connectorAccountRemove({ accountId }));
  },

  botConnectors(slug: string): { connectors: BotConnector[] } {
    return unwrap(this.methods.botConnectors({ slug }));
  },
} satisfies ThisType<{ methods: ConnectorsBridgeMethods }>;
