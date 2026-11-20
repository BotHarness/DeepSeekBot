import { createGroupChannel } from '@botharness/host-client/channel-management';
import { HostAnswerInvalid } from '@botharness/host-client/host-answer';
import {
  createHostClient,
  deviceRefusal,
  MethodRefused,
  type HostClient,
  type RemoteSource,
} from '@botharness/host-client/client';
import { listBots } from '@botharness/host-client/bots';
import type { SavedHost } from '@botharness/host-client/hosts';
import type { HostCarrier } from '@botharness/host-protocol/carrier';
import { ChannelCreationNotAccepted, type ChannelCreationPort } from './channel-creation';

export function channelCreationTransport(
  hosts: () => readonly SavedHost[],
  carrier: HostCarrier,
): ChannelCreationPort {
  const request = async <T>(
    hostId: string,
    deviceId: string,
    run: (client: HostClient) => Promise<T>,
    creation = false,
  ) => {
    const host = hosts().find((host) => host.hostId === hostId && host.deviceId === deviceId);
    if (!host) throw new Error('target-unpaired');
    const paired = () =>
      hosts().some(
        (entry) =>
          entry.hostId === hostId &&
          entry.deviceId === deviceId &&
          entry.credential === host.credential,
      );
    let uncertain = false;
    for (const route of host.routes) {
      if (!paired()) throw new Error('target-unpaired');
      const client = createHostClient({ ...host, routes: [route], carrier });
      try {
        const result = await run(client);
        if (!paired()) throw new Error('target-unpaired');
        return result;
      } catch (error) {
        const refusal = deviceRefusal(error);
        if (refusal) throw new Error(refusal, { cause: error });
        if (creation && error instanceof HostAnswerInvalid)
          throw new Error('invalid-response', { cause: error });
        if (error instanceof MethodRefused) {
          if (
            creation &&
            !uncertain &&
            ['unknown-bot', 'archived-bot', 'protected-bot', 'invalid-input'].includes(error.code)
          )
            throw new ChannelCreationNotAccepted(error.code);
          throw new Error(error.code, { cause: error });
        }
        if (!paired()) throw new Error('target-unpaired', { cause: error });
        uncertain = true;
      } finally {
        client.stop();
      }
    }
    throw new Error('unreachable');
  };
  const avatarSource = (client: HostClient, host: SavedHost, path: string): RemoteSource => {
    const source = client.resource(path);
    if (!source.read) return source;
    const route = client.getSnapshot().connection.route;
    return {
      ...source,
      async read(signal) {
        const paired = () =>
          hosts().some(
            (entry) =>
              entry.hostId === host.hostId &&
              entry.deviceId === host.deviceId &&
              entry.credential === host.credential,
          );
        if (!paired()) throw new Error('target-unpaired');
        const imageClient = createHostClient({
          ...host,
          routes: [route],
          carrier,
        });
        try {
          const read = imageClient.resource(path).read;
          if (!read) throw new Error('resource-unavailable');
          const result = await read(signal);
          if (!paired()) throw new Error('target-unpaired');
          return result;
        } finally {
          imageClient.stop();
        }
      },
    };
  };
  return {
    deviceId: (id) => hosts().find((host) => host.hostId === id)?.deviceId,
    async candidates(hostId) {
      const host = hosts().find((host) => host.hostId === hostId);
      if (!host) throw new Error('target-unpaired');
      const deviceId = host.deviceId;
      return request(hostId, deviceId, async (client) => {
        return (await listBots(client)).flatMap((bot) =>
          bot.paused === true || bot.deleted === true || bot.tob !== undefined
            ? []
            : [
                {
                  slug: bot.slug,
                  displayName: bot.displayName,
                  ...('appearance' in bot ? { appearance: bot.appearance } : {}),
                  ...(bot.avatarSeed === 2 ? { avatarSeed: bot.avatarSeed } : {}),
                  ...(typeof bot.avatar === 'string' &&
                  bot.avatar.startsWith('/') &&
                  !bot.avatar.startsWith('//')
                    ? { avatarSource: avatarSource(client, host, bot.avatar) }
                    : {}),
                },
              ],
        );
      });
    },
    create(operation) {
      return request(
        operation.hostId,
        operation.deviceId,
        async (client) => {
          const channel = await createGroupChannel(client, {
            name: operation.name,
            members: operation.members,
            operationKey: operation.operationKey,
          });
          return channel.id;
        },
        true,
      );
    },
  };
}
