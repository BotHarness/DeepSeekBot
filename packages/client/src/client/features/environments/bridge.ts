import { asRecord, stringArray } from '../../bridge-transport.js';
import type { ChannelSummary } from '../../store.js';

export function parseRemoteChannelMetadata(
  record: Record<string, unknown>,
  type: 'dm' | 'group',
  botSlug: unknown,
): Pick<ChannelSummary, 'remoteBot' | 'remoteContact' | 'remoteAvailability'> | undefined {
  const remote = asRecord(record['remoteBot']);
  const remoteBot =
    remote !== undefined &&
    typeof remote['hostId'] === 'string' &&
    /^[a-zA-Z0-9_-]{1,128}$/u.test(remote['hostId']) &&
    typeof remote['botSlug'] === 'string' &&
    typeof remote['displayName'] === 'string'
      ? {
          hostId: remote['hostId'],
          botSlug: remote['botSlug'],
          displayName: remote['displayName'],
        }
      : undefined;
  if (
    record['remoteBot'] !== undefined &&
    (remoteBot === undefined ||
      type !== 'dm' ||
      botSlug !== undefined ||
      stringArray(record['members']).length !== 1)
  )
    return undefined;
  const contact = asRecord(record['remoteContact']);
  const availability = record['remoteAvailability'];
  const remoteAvailability =
    availability === 'available' ||
    availability === 'withdrawn' ||
    availability === 'bot-unavailable'
      ? availability
      : 'unavailable';
  const device = asRecord(contact?.['device']);
  const remoteContact =
    remoteBot !== undefined &&
    contact?.['hostId'] === remoteBot.hostId &&
    contact['botSlug'] === remoteBot.botSlug &&
    typeof contact['displayName'] === 'string' &&
    device !== undefined
      ? {
          hostId: remoteBot.hostId,
          botSlug: remoteBot.botSlug,
          displayName: contact['displayName'],
          ...(typeof contact['description'] === 'string'
            ? { description: contact['description'] }
            : {}),
          device: {
            model: typeof device['model'] === 'string' ? device['model'] : null,
            platform: typeof device['platform'] === 'string' ? device['platform'] : null,
          },
          capabilities: stringArray(contact['capabilities']),
        }
      : undefined;
  return {
    ...(remoteBot === undefined ? {} : { remoteBot }),
    ...(remoteContact === undefined ? {} : { remoteContact }),
    ...(remoteBot === undefined ? {} : { remoteAvailability }),
  };
}
