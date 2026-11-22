import type { Context } from '@deepseek-ai/cordis';
import { CONNECT_CHANNEL_PATH } from '@botharness/host-protocol/noise/channel';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { LocalVideoOwner } from '../../../computer/src/local-video-contract.js';
import { localVideoCommand } from '../../../computer/src/local-video-http.js';
import type { ActivityDelivery } from '../live-activity/delivery.js';
import type { PushDelivery } from '../push/delivery.js';
import { createDevicePushHttp } from '../push/http.js';
import type { createMemberDevices } from '../team/devices.js';
import type { TeamHttp } from '../team/http.js';
import { mountTeamGateway } from '../team/mount.js';
import type { TeamService } from '../team/service.js';
import type { VoiceCallResult } from '../voice/call-contract.js';
import type { createConnectBotBridge } from './bot-connect-bridge.js';
import { BOT_CONNECT_PATH } from './bot-connect-channel.js';
import type { ConnectAccount } from './connect-account.js';
import type { createDevicesHttp } from './http.js';
import { createChannelDiscovery } from './channel-discovery.js';
import type { createDevicePairing } from './pairing.js';
import type { ConnectionLike, WebServerLike } from './mount-types.js';
import {
  createDeviceGateway,
  DEVICE_GATEWAY_PREFIX,
  DEVICE_MUX_PATH,
  DEVICE_SIGNALING_PATHS,
} from './gateway.js';

export function mountDeviceGateway(
  ctx: Context,
  webCtx: Context,
  {
    connection,
    webServer,
    teamService,
    memberDevices,
    pairing,
    write,
    videoOwner,
    voiceCall,
    delivery,
    account,
    connectBots,
    encryption,
  }: {
    connection: ConnectionLike;
    webServer: WebServerLike;
    teamService: TeamService | undefined;
    memberDevices: ReturnType<typeof createMemberDevices> | undefined;
    pairing: ReturnType<typeof createDevicePairing>;
    write: (plugin: string, kind: string, message: string) => void;
    videoOwner: () => LocalVideoOwner | undefined;
    voiceCall: (
      caller: { deviceId: string },
      command: unknown,
      signal: AbortSignal,
    ) => Promise<VoiceCallResult>;
    delivery: () => { push: PushDelivery | undefined; activity: ActivityDelivery | undefined };
    account: ConnectAccount;
    connectBots: ReturnType<typeof createConnectBotBridge> | undefined;
    encryption: NonNullable<Parameters<typeof createDevicesHttp>[0]['encryption']>;
  },
): void {
  let memberGateway: TeamHttp | undefined;
  if (teamService)
    write(
      'team',
      'carrier-waiting',
      `team phase=waiting gateway=${Boolean(webCtx.get('typertGateway'))} access=${Boolean(webCtx.get('remoteAccess'))} modules=${Boolean(webCtx.get('clientModules'))}`,
    );
  if (teamService)
    webCtx.inject(['typert', 'typertGateway', 'remoteAccess', 'clientModules'], (teamCtx) => {
      try {
        memberGateway = mountTeamGateway(
          teamCtx,
          teamService,
          () => pairing.host().name,
          memberDevices!,
          (phase, facts) =>
            write('team', `carrier-${phase}`, `team phase=${phase} facts=${JSON.stringify(facts)}`),
        );
      } catch (error) {
        write(
          'team',
          'carrier-failed',
          `team phase=failed error=${error instanceof Error ? error.message.slice(0, 300) : 'runtime-error'}`,
        );
        throw error;
      }
      teamCtx.effect(
        () => () => {
          memberGateway = undefined;
        },
        'botharness: member carrier readiness',
      );
    });
  const team = teamService
    ? {
        get device() {
          return memberGateway?.device;
        },
        async handle(request: IncomingMessage, response: ServerResponse) {
          if (memberGateway) return memberGateway.handle(request, response);
          response.writeHead(503, {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          });
          response.end(JSON.stringify({ code: 'member-carrier-unavailable' }));
        },
        async close() {
          await memberGateway?.close();
        },
      }
    : undefined;
  const { push, activity } = delivery();
  const discover = createChannelDiscovery({
    host: () => pairing.host(),
    encryption,
    passwordSignInAvailable: () => memberDevices?.passwordSignInAvailable() ?? false,
  });
  const gateway = createDeviceGateway({
    ...(team ? { team } : {}),
    pairing,
    port: () => webServer.port,
    authenticatedUrl: (base) => connection.authenticatedUrl(base),
    log: (message) => ctx.logger.info(message),
    localVideo: ({ deviceId, command, signal }) =>
      localVideoCommand(videoOwner(), { deviceId }, command, signal),
    voiceCall: ({ deviceId, command, signal }) => voiceCall({ deviceId }, command, signal),
    ...(push === undefined ? {} : { push: createDevicePushHttp(push) }),
    ...(activity === undefined ? {} : { activity: activity.handle }),
    connectOffer: (body, signature) => account.verifyOffer(body, signature),
  });
  webCtx.effect(
    () =>
      webServer.register({
        kind: 'prefix',
        path: DEVICE_GATEWAY_PREFIX,
        handler: async (request, response) => {
          if (request.url?.startsWith(`${BOT_CONNECT_PATH}/`)) {
            if (connectBots === undefined) {
              response.writeHead(503);
              response.end();
              return;
            }
            await connectBots.handle(request, response);
            return;
          }
          if (request.url === CONNECT_CHANNEL_PATH) return discover(request, response);
          await gateway.handle(request, response);
        },
      }),
    'botharness: device gateway',
  );
  for (const path of [DEVICE_MUX_PATH, ...DEVICE_SIGNALING_PATHS])
    webCtx.effect(
      () =>
        webServer.registerUpgrade({
          path,
          handler: (request, socket, head) => void gateway.upgrade(request, socket, head),
        }),
      `botharness: device gateway stream ${path}`,
    );
}
