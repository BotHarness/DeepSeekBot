import type { TypertLookup } from '@deepseek-ai/dsh-typert-protocol';
import type { Context } from '@deepseek-ai/cordis';
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';
import type { TypertGateway } from '@deepseek-ai/dsh-api-gateway';
import type { RemoteAccessService } from '@deepseek-ai/dsh-api-remote-access';
import type { WebServer } from '@deepseek-ai/dsh-host-webserver';
import type { ClientModuleRegistry } from '@deepseek-ai/dsh-client-modules';
import { z } from 'zod';
import { createTeamHttp, TEAM_PATH, type TeamHttp } from './http.js';
import { memberPolicy } from './policy.js';
import { TeamError, type TeamService } from './service.js';

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertLookupMap {
    'botharness-public-flag': TypertLookup<boolean, boolean>;
  }
}

function connectionService(
  value: unknown,
): value is Pick<HostConnectionHandle, 'createPeer' | 'fetch'> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'createPeer' in value &&
    typeof value.createPeer === 'function' &&
    'fetch' in value &&
    value.fetch !== null &&
    typeof value.fetch === 'object' &&
    'register' in value.fetch &&
    typeof value.fetch.register === 'function'
  );
}

function gatewayService(value: unknown): value is TypertGateway {
  return (
    value !== null &&
    typeof value === 'object' &&
    'invoke' in value &&
    typeof value.invoke === 'function' &&
    'stream' in value &&
    typeof value.stream === 'function' &&
    'wireStream' in value &&
    value.wireStream !== null &&
    typeof value.wireStream === 'object' &&
    'open' in value.wireStream &&
    typeof value.wireStream.open === 'function' &&
    'failure' in value.wireStream &&
    typeof value.wireStream.failure === 'function' &&
    'hasLiveClient' in value &&
    typeof value.hasLiveClient === 'function' &&
    'getPendingRemoteEvents' in value &&
    typeof value.getPendingRemoteEvents === 'function' &&
    'registerRemoteEvents' in value &&
    typeof value.registerRemoteEvents === 'function'
  );
}
function accessService(
  value: unknown,
): value is Pick<RemoteAccessService, 'registerPolicy' | 'invalidate'> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'registerPolicy' in value &&
    typeof value.registerPolicy === 'function' &&
    'invalidate' in value &&
    typeof value.invalidate === 'function'
  );
}
function webService(
  value: unknown,
): value is Pick<WebServer, 'readResource' | 'getOrigin' | 'protocol'> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'readResource' in value &&
    typeof value.readResource === 'function' &&
    'getOrigin' in value &&
    typeof value.getOrigin === 'function' &&
    'protocol' in value &&
    ['http:', 'https:'].includes(String(value.protocol))
  );
}
function moduleService(value: unknown): value is Pick<ClientModuleRegistry, 'fetchBundle'> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'fetchBundle' in value &&
    typeof value.fetchBundle === 'function'
  );
}

export function mountTeamGateway(
  ctx: Context,
  team: TeamService,
  hostName: () => string,
  log: (phase: string, facts: Record<string, boolean>) => void = () => {},
): TeamHttp | undefined {
  const connection: unknown = ctx.get('connection');
  const gateway: unknown = ctx.get('typertGateway');
  const access: unknown = ctx.get('remoteAccess');
  const web: unknown = ctx.get('webServer');
  const modules: unknown = ctx.get('clientModules');
  log('capabilities', {
    connection: connectionService(connection),
    gateway: gatewayService(gateway),
    access: accessService(access),
    web: webService(web),
    modules: moduleService(modules),
  });
  if (
    !connectionService(connection) ||
    !gatewayService(gateway) ||
    !accessService(access) ||
    !webService(web) ||
    !moduleService(modules)
  ) {
    ctx.logger.warn('team phase=unavailable code=member-carrier-unavailable');
    return undefined;
  }
  ctx.effect(
    () => access.registerPolicy('botharness-member', memberPolicy(team)),
    'botharness: member access',
  );
  ctx.effect(
    () =>
      team.bindRuntime({
        createPeer: (principal) => connection.createPeer({ principal }),
        invalidate: () => access.invalidate(),
        urls: () => [`${web.getOrigin()}${TEAM_PATH}/`],
      }),
    'botharness: member peers',
  );
  const http = createTeamHttp({
    team,
    gateway,
    hostName,
    tls: () => web.protocol === 'https:',
    readResource: (request, peer) => web.readResource(request, peer),
    fetchBundle: (request) => modules.fetchBundle(request),
  });
  ctx.effect(() => () => http.close(), 'botharness: member streams');
  ctx.effect(
    () =>
      connection.fetch.register({
        path: '/api/botharness/team-as',
        methods: ['POST'],
        requestBody: 'buffered',
        async fetch(request) {
          try {
            const input = z
              .object({
                username: z.string(),
                namespace: z.string(),
                method: z.string(),
                args: z.record(z.string(), z.unknown()),
              })
              .parse(await request.json());
            const value = await team.asMember(input.username, (peer) => {
              team.assertCall(peer.principal, input.method);
              return gateway.invoke({
                namespace: input.namespace,
                method: input.method,
                args: input.args,
                peer,
                signal: request.signal,
              });
            });
            return Response.json({ ok: true, value });
          } catch (error) {
            const failure =
              error instanceof TeamError
                ? { code: error.code, message: error.code }
                : gateway.wireStream.failure(error);
            return Response.json({ ok: false, error: failure });
          }
        },
      }),
    'botharness: Owner member CLI dispatch',
  );
  ctx.effect(
    () =>
      ctx.typert.lookups.register('botharness-public-flag', {
        parameter: 'publicValue',
        wire: 'public',
        hostTypeSymbol: 'botharness.PublicFlag',
        wireTypeSymbol: 'boolean',
        resolve(value: unknown) {
          if (typeof value !== 'boolean') throw new TeamError('invalid-input');
          return value;
        },
      }),
    'botharness: public flag wire alias',
  );
  return http;
}
