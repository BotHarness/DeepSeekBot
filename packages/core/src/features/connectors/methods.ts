import { asObject, invalidInput, type BridgeResult } from '../../bridge/method-utils.js';
import {
  ConnectorError,
  type BotConnector,
  type ConnectorAppSearch,
  type ConnectorService,
  type ConnectorsView,
} from '../../connectors/service.js';
import type { McpAppSearch } from '../../connectors/remote.js';
import type { ConnectorAccess, ConnectorAccountRecord } from '../../connectors/store.js';

export interface ConnectorsBridgeDeps {
  connectors?: ConnectorService;
  registry: { get(slug: string): { displayName: string } | undefined };
}

export interface ConnectorsBridgeMethods {
  connectors(payload: unknown): Promise<BridgeResult<ConnectorsView>>;
  connectorKeySet(payload: unknown): Promise<BridgeResult<ConnectorsView>>;
  connectorKeyClear(payload: unknown): Promise<BridgeResult<ConnectorsView>>;
  connectorConnect(
    payload: unknown,
  ): Promise<BridgeResult<{ account: ConnectorAccountRecord; url?: string }>>;
  connectorReconnect(
    payload: unknown,
  ): Promise<BridgeResult<{ account: ConnectorAccountRecord; url?: string }>>;
  connectorRefresh(payload: unknown): Promise<BridgeResult<ConnectorsView>>;
  connectorSearch(payload: unknown): Promise<BridgeResult<ConnectorAppSearch>>;
  connectorLogos(payload: unknown): Promise<BridgeResult<{ logos: Record<string, string> }>>;
  connectorMcpSearch(payload: unknown): Promise<BridgeResult<McpAppSearch>>;
  connectorMcpAdd(
    payload: unknown,
  ): Promise<BridgeResult<{ account: ConnectorAccountRecord; url?: string }>>;
  connectorMcpFinish(payload: unknown): Promise<BridgeResult<{ account: ConnectorAccountRecord }>>;
  connectorGrantSet(
    payload: unknown,
  ): BridgeResult<{ changed: boolean; connectors: BotConnector[] }>;
  connectorAccountRemove(payload: unknown): Promise<BridgeResult<{ removed: boolean }>>;
  botConnectors(payload: unknown): BridgeResult<{ connectors: BotConnector[] }>;
}

function signInAccess(value: unknown): { access?: ConnectorAccess } | undefined {
  if (value === undefined) return {};
  return value === 'read' || value === 'write' ? { access: value } : undefined;
}

function failure(error: unknown): BridgeResult<never> {
  if (!(error instanceof ConnectorError)) throw error;
  if (error.code === 'read-only-unsupported')
    return {
      ok: false,
      error: { code: 'connector-read-only-unsupported', message: error.message },
    };
  return {
    ok: false,
    error: {
      code:
        error.code === 'invalid'
          ? 'invalid-input'
          : error.code === 'not-found'
            ? 'not-found'
            : error.code === 'not-configured'
              ? 'connector-not-configured'
              : 'connector-unavailable',
      message: error.message,
    },
  };
}

const forbidden: BridgeResult<never> = {
  ok: false,
  error: {
    code: 'permission-required',
    message: 'Only the Host Owner manages App connections',
    details: { permission: 'connectors.manage' },
  },
};

const missing: BridgeResult<never> = {
  ok: false,
  error: {
    code: 'storage-unavailable',
    message: 'App connection storage is unavailable',
  },
};

export function createConnectorsBridgeMethods(
  deps: ConnectorsBridgeDeps,
  isHostOwner: () => boolean,
): ConnectorsBridgeMethods {
  const guarded = async <T>(
    run: (service: ConnectorService) => Promise<T>,
  ): Promise<BridgeResult<T>> => {
    if (!isHostOwner()) return forbidden;
    if (deps.connectors === undefined) return missing;
    try {
      return { ok: true, value: await run(deps.connectors) };
    } catch (error) {
      return failure(error);
    }
  };
  const named = (view: ConnectorsView): ConnectorsView => ({
    ...view,
    accounts: view.accounts.map((account) => ({
      ...account,
      grants: account.grants.map((grant) => {
        const name = deps.registry.get(grant.botSlug)?.displayName;
        return name === undefined ? grant : { ...grant, botName: name };
      }),
    })),
  });
  return {
    connectors: () => guarded(async (service) => named(await service.view())),
    connectorKeySet(payload) {
      const apiKey = asObject(payload)['apiKey'];
      if (typeof apiKey !== 'string') return Promise.resolve(invalidInput('apiKey is required'));
      return guarded(async (service) => named(await service.setKey(apiKey)));
    },
    connectorKeyClear: () => guarded(async (service) => named(await service.clearKey())),
    connectorConnect(payload) {
      const source = asObject(payload);
      const service = source['service'];
      const label = source['label'];
      const access = signInAccess(source['access']);
      if (
        typeof service !== 'string' ||
        (label !== undefined && typeof label !== 'string') ||
        access === undefined
      )
        return Promise.resolve(
          invalidInput(
            'service, an optional label and an optional access (read or write) are required',
          ),
        );
      return guarded((connectors) =>
        connectors.connect({
          service,
          ...(label === undefined ? {} : { label }),
          ...access,
        }),
      );
    },
    connectorReconnect(payload) {
      const source = asObject(payload);
      const accountId = source['accountId'];
      const access = signInAccess(source['access']);
      if (typeof accountId !== 'string' || access === undefined)
        return Promise.resolve(
          invalidInput('accountId and an optional access (read or write) are required'),
        );
      return guarded((service) => service.reconnect(accountId, access.access));
    },
    connectorRefresh: () => guarded(async (service) => named(await service.refresh())),
    connectorSearch(payload) {
      const source = asObject(payload);
      const query = source['query'] ?? '';
      const cursor = source['cursor'];
      if (typeof query !== 'string' || (cursor !== undefined && typeof cursor !== 'string'))
        return Promise.resolve(invalidInput('query and an optional cursor must be strings'));
      return guarded((service) => service.searchApps(query, cursor));
    },
    connectorLogos(payload) {
      const services = asObject(payload)['services'];
      if (
        !Array.isArray(services) ||
        services.length > 60 ||
        services.some((service) => typeof service !== 'string')
      )
        return Promise.resolve(invalidInput('services must be up to 60 strings'));
      return guarded(async (service) => ({ logos: await service.logos(services as string[]) }));
    },
    connectorMcpSearch(payload) {
      const source = asObject(payload);
      const query = source['query'] ?? '';
      const cursor = source['cursor'];
      if (typeof query !== 'string' || (cursor !== undefined && typeof cursor !== 'string'))
        return Promise.resolve(invalidInput('query and an optional cursor must be strings'));
      return guarded((service) => service.remote.search(query, cursor));
    },
    connectorMcpAdd(payload) {
      const source = asObject(payload);
      const url = source['url'];
      const name = source['name'];
      const label = source['label'];
      const access = signInAccess(source['access']);
      if (
        typeof url !== 'string' ||
        (name !== undefined && typeof name !== 'string') ||
        (label !== undefined && typeof label !== 'string') ||
        access === undefined
      )
        return Promise.resolve(
          invalidInput(
            'url, an optional name and label and an optional access (read or write) are required',
          ),
        );
      return guarded((service) =>
        service.remote.add({
          url,
          ...(name === undefined ? {} : { name }),
          ...(label === undefined ? {} : { label }),
          ...access,
        }),
      );
    },
    connectorMcpFinish(payload) {
      const url = asObject(payload)['url'];
      if (typeof url !== 'string') return Promise.resolve(invalidInput('url is required'));
      return guarded(async (service) => {
        let params: URLSearchParams;
        try {
          params = new URL(url.trim()).searchParams;
        } catch {
          throw new ConnectorError('invalid', 'Paste the whole address the sign-in page opened.');
        }
        return { account: await service.remote.finish(params) };
      });
    },
    connectorGrantSet(payload) {
      if (!isHostOwner()) return forbidden;
      if (deps.connectors === undefined) return missing;
      const source = asObject(payload);
      const slug = source['slug'];
      const accountId = source['accountId'];
      const access = source['access'];
      if (
        typeof slug !== 'string' ||
        typeof accountId !== 'string' ||
        (access !== null && access !== 'read' && access !== 'write')
      )
        return invalidInput('slug, accountId and access (read, write or null) are required');
      if (deps.registry.get(slug) === undefined)
        return {
          ok: false,
          error: { code: 'not-found', message: `unknown PersonaBot: ${slug}` },
        };
      try {
        const changed = deps.connectors.grant(slug, accountId, access ?? undefined);
        return {
          ok: true,
          value: { changed, connectors: deps.connectors.forBot(slug) },
        };
      } catch (error) {
        return failure(error);
      }
    },
    connectorAccountRemove(payload) {
      const accountId = asObject(payload)['accountId'];
      if (typeof accountId !== 'string')
        return Promise.resolve(invalidInput('accountId is required'));
      return guarded(async (service) => ({
        removed: await service.remove(accountId),
      }));
    },
    botConnectors(payload) {
      if (!isHostOwner()) return forbidden;
      if (deps.connectors === undefined) return missing;
      const slug = asObject(payload)['slug'];
      if (typeof slug !== 'string') return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined)
        return {
          ok: false,
          error: { code: 'not-found', message: `unknown PersonaBot: ${slug}` },
        };
      return { ok: true, value: { connectors: deps.connectors.forBot(slug) } };
    },
  };
}
