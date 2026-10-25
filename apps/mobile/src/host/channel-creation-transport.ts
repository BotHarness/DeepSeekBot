import {
  createHostClient,
  deviceRefusal,
  MethodRefused,
  type HostClient,
  type RemoteSource,
} from './client';
import type { SavedHost } from './hosts';
import type { HostCarrier } from './carrier';
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
        if (refusal) throw new Error(refusal);
        if (error instanceof MethodRefused) {
          if (
            creation &&
            !uncertain &&
            ['unknown-bot', 'archived-bot', 'protected-bot', 'invalid-input'].includes(error.code)
          )
            throw new ChannelCreationNotAccepted(error.code);
          throw new Error(error.code);
        }
        if (!paired()) throw new Error('target-unpaired');
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
        const imageClient = createHostClient({ ...host, routes: [route], carrier });
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
        const result = await client.call<unknown>('list');
        if (
          typeof result !== 'object' ||
          result === null ||
          !('bots' in result) ||
          !Array.isArray(result.bots)
        )
          throw new MethodRefused('invalid-response', 'Invalid Bot list');
        return result.bots.flatMap((bot: unknown) => {
          if (
            typeof bot !== 'object' ||
            bot === null ||
            !('slug' in bot) ||
            typeof bot.slug !== 'string' ||
            !('displayName' in bot) ||
            typeof bot.displayName !== 'string'
          )
            throw new MethodRefused('invalid-response', 'Invalid Bot');
          if (
            ('paused' in bot && bot.paused === true) ||
            ('deleted' in bot && bot.deleted === true) ||
            ('tob' in bot && bot.tob !== undefined)
          )
            return [];
          return [
            {
              slug: bot.slug,
              displayName: bot.displayName,
              ...('appearance' in bot ? { appearance: bot.appearance } : {}),
              ...('avatarSeed' in bot && bot.avatarSeed === 2
                ? { avatarSeed: bot.avatarSeed }
                : {}),
              ...('avatar' in bot &&
              typeof bot.avatar === 'string' &&
              bot.avatar.startsWith('/') &&
              !bot.avatar.startsWith('//')
                ? { avatarSource: avatarSource(client, host, bot.avatar) }
                : {}),
            },
          ];
        });
      });
    },
    create(operation) {
      return request(
        operation.hostId,
        operation.deviceId,
        async (client) => {
          const result = await client.call<unknown>('channelCreate', {
            name: operation.name,
            members: operation.members,
            operationKey: operation.operationKey,
          });
          if (
            typeof result !== 'object' ||
            result === null ||
            !('channel' in result) ||
            typeof result.channel !== 'object' ||
            result.channel === null ||
            !('id' in result.channel) ||
            typeof result.channel.id !== 'string' ||
            !('receipt' in result) ||
            typeof result.receipt !== 'object' ||
            result.receipt === null ||
            !('operationKey' in result.receipt) ||
            result.receipt.operationKey !== operation.operationKey ||
            !('status' in result.receipt) ||
            result.receipt.status !== 'completed' ||
            !('channelId' in result.receipt) ||
            result.receipt.channelId !== result.channel.id
          )
            throw new MethodRefused('invalid-response', 'Invalid Channel result');
          return result.channel.id;
        },
        true,
      );
    },
  };
}
