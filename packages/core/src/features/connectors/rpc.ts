import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
import { unwrap, unwrapAsync } from '../../bridge/rpc-result.js';
import type { BotConnector, ConnectorAppSearch, ConnectorsView } from '../../connectors/service.js';
import type { ConnectorAccess, ConnectorAccountRecord } from '../../connectors/store.js';

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
  ): Promise<{ account: ConnectorAccountRecord; url: string }> {
    return unwrapAsync(this.methods.connectorConnect({ service, label }));
  },

  connectorReconnect(accountId: string): Promise<{ account: ConnectorAccountRecord; url: string }> {
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
} satisfies ThisType<BridgeRpcReceiver>;
