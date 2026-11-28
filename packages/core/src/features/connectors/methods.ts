import { asObject, invalidInput, type BridgeResult } from '../../kernel/method-utils.js';
import type { ChannelStore } from '../../channels/store.js';
import type { HumanContext } from '../../humans/context.js';
import type { ChannelToolApproval } from '../../workspaces/tool-approval.js';
import { connectorCatalogFor } from '../../connectors/mount.js';
import {
  ConnectorError,
  type BotConnector,
  type ConnectorAppSearch,
  type ConnectorService,
  type ConnectorsView,
} from '../../connectors/service.js';
import type { McpAppSearch } from '../../connectors/remote.js';
import type { ConnectorAccountRecord } from '../../connectors/store.js';

export interface ConnectorsBridgeDeps {
  connectors?: ConnectorService;
  channels: Pick<ChannelStore, 'message'>;
  toolApproval?: Pick<ChannelToolApproval, 'decide'>;
  registry: { get(slug: string): { displayName: string } | undefined };
}

export type ConnectorsBridgeMethods = {
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
  connectorCatalog(payload: unknown): Promise<BridgeResult<ReturnType<typeof connectorCatalogFor>>>;
  connectorGrantExplain(
    payload: unknown,
  ): Promise<BridgeResult<ReturnType<ConnectorService['explainGrant']>>>;
  connectorRequestDecide(payload: unknown): Promise<BridgeResult<{ accepted: boolean }>>;
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
};

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
  human: HumanContext,
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
    connectorSearch(payload) {
      const source = asObject(payload);
      const query = source['query'] ?? '';
      const cursor = source['cursor'];
      if (typeof query !== 'string' || (cursor !== undefined && typeof cursor !== 'string'))
        return Promise.resolve(invalidInput('query and an optional cursor must be strings'));
      return guarded((service) => service.searchApps(query, cursor));
    },
    async connectorCatalog(payload) {
      const { slug, query = '' } = asObject(payload);
      if (typeof slug !== 'string' || typeof query !== 'string')
        return invalidInput('slug and an optional query are required');
      return guarded(async (service) => {
        if (deps.registry.get(slug) === undefined)
          throw new ConnectorError('not-found', `Unknown PersonaBot: ${slug}`);
        const [view, found] = await Promise.all([
          service.view(),
          service.searchApps(query).catch(() => undefined),
        ]);
        return connectorCatalogFor(service, slug, view.configured, query, found?.apps);
      });
    },
    async connectorGrantExplain(payload) {
      const { slug, accountId } = asObject(payload);
      if (typeof slug !== 'string' || typeof accountId !== 'string')
        return invalidInput('slug and accountId are required');
      return guarded(async (service) => {
        if (deps.registry.get(slug) === undefined)
          throw new ConnectorError('not-found', `Unknown PersonaBot: ${slug}`);
        return service.explainGrant(slug, accountId);
      });
    },
    async connectorRequestDecide(payload) {
      if (!isHostOwner()) return forbidden;
      const { channelId, messageId, choice } = asObject(payload);
      if (
        typeof channelId !== 'string' ||
        typeof messageId !== 'string' ||
        (choice !== 'once' && choice !== 'persistent' && choice !== 'deny')
      )
        return invalidInput(
          'channelId, messageId and choice (once, persistent or deny) are required',
        );
      const message = deps.channels.message(channelId, messageId);
      const request = message?.toolApprovalRequest;
      const broker = deps.toolApproval;
      const service = deps.connectors;
      if (
        message?.author.kind !== 'bot' ||
        request?.toolName !== 'connector_request' ||
        broker === undefined ||
        service === undefined
      )
        return invalidInput('The connector request is not available.');
      const slug = message.author.slug;
      const decide = () =>
        broker.decide(human, slug, messageId, choice === 'deny' ? 'rejected' : 'allowed-once');
      const accepted = await (choice === 'once'
        ? service.decideOnce(request.sessionId, request.callId, decide)
        : decide());
      return accepted
        ? { ok: true, value: { accepted: true } }
        : invalidInput('The connector request is no longer pending.');
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
      if (
        typeof url !== 'string' ||
        (name !== undefined && typeof name !== 'string') ||
        (label !== undefined && typeof label !== 'string')
      )
        return Promise.resolve(invalidInput('url and an optional name and label are required'));
      return guarded((service) =>
        service.remote.add({
          url,
          ...(name === undefined ? {} : { name }),
          ...(label === undefined ? {} : { label }),
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
