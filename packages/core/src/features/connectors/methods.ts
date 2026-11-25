import { asObject, invalidInput, type BridgeResult } from '../../bridge/method-utils.js';
import {
  ConnectorError,
  type BotConnector,
  type ConnectorService,
  type ConnectorsView,
} from '../../connectors/service.js';
import type { ConnectorAccountRecord } from '../../connectors/store.js';

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
  ): Promise<BridgeResult<{ account: ConnectorAccountRecord; url: string }>>;
  connectorReconnect(
    payload: unknown,
  ): Promise<BridgeResult<{ account: ConnectorAccountRecord; url: string }>>;
  connectorRefresh(payload: unknown): Promise<BridgeResult<ConnectorsView>>;
  connectorGrantSet(
    payload: unknown,
  ): BridgeResult<{ changed: boolean; connectors: BotConnector[] }>;
  connectorAccountRemove(payload: unknown): Promise<BridgeResult<{ removed: boolean }>>;
  botConnectors(payload: unknown): BridgeResult<{ connectors: BotConnector[] }>;
}

function failure(error: unknown): BridgeResult<never> {
  if (!(error instanceof ConnectorError)) throw error;
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
      if (typeof service !== 'string' || (label !== undefined && typeof label !== 'string'))
        return Promise.resolve(invalidInput('service and an optional label are required'));
      return guarded((connectors) =>
        connectors.connect({
          service,
          ...(label === undefined ? {} : { label }),
        }),
      );
    },
    connectorReconnect(payload) {
      const accountId = asObject(payload)['accountId'];
      if (typeof accountId !== 'string')
        return Promise.resolve(invalidInput('accountId is required'));
      return guarded((service) => service.reconnect(accountId));
    },
    connectorRefresh: () => guarded(async (service) => named(await service.refresh())),
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
