import type { HostCarrier } from '@botharness/host-protocol/carrier';
import { checkRoute, isEncryptedRoute } from '@botharness/host-protocol/route';
import type { HostClientOptions, RemoteSource } from './client-contract';
import { encodeBase64 } from './encrypted-carrier';
import { DEVICE_PREFIX } from './pairing';

export function createHostResources(
  options: HostClientOptions,
  carrier: HostCarrier,
  authorization: Record<string, string>,
  timeoutMs: number,
  connection: { readonly route: string; readonly running: boolean },
  publish: () => void,
) {
  const avatars = new Map<string, string>();
  const avatarLoading = new Set<string>();

  const absolute = (path: string): string =>
    path.startsWith('/') ? `${connection.route}${DEVICE_PREFIX}${path}` : path;

  const scope = options.hostId ? { scope: options.hostId } : {};
  const resource = (path: string): RemoteSource => {
    if (
      checkRoute(connection.route, options.encryption?.privateRelay).ok &&
      !isEncryptedRoute(connection.route, options.encryption)
    )
      return { uri: absolute(path), headers: authorization, ...scope };
    const origin = connection.route;
    return {
      ...scope,
      uri: `connect-resource:${options.hostId ?? ''}:${path}`,
      headers: {},
      read: async (signal) => {
        if (!path.startsWith('/') || path.startsWith('//'))
          throw new Error('resource-path-invalid');
        const response = await carrier.request(`${origin}${DEVICE_PREFIX}${path}`, {
          method: 'GET',
          signal,
        });
        if (response.status !== 200 || !response.bytes) throw new Error('resource-unavailable');
        return {
          bytes: await response.bytes(),
          mime: response.contentType ?? 'application/octet-stream',
        };
      },
    };
  };
  const avatar = (path: string): { avatarUrl?: string; avatarHeaders?: Record<string, string> } => {
    if (!checkRoute(connection.route, options.encryption?.privateRelay).ok) return {};
    if (!isEncryptedRoute(connection.route, options.encryption))
      return { avatarUrl: absolute(path), avatarHeaders: authorization };
    const key = connection.route + path;
    const cached = avatars.get(key);
    if (cached) return { avatarUrl: cached, avatarHeaders: {} };
    if (
      connection.running &&
      avatars.size < 64 &&
      avatarLoading.size < 8 &&
      !avatarLoading.has(key)
    ) {
      avatarLoading.add(key);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      void resource(path).read!(controller.signal)
        .then(
          ({ bytes, mime }) => {
            if (
              connection.running &&
              bytes.length <= 512 * 1024 &&
              /^image\/(?:png|jpeg|webp|gif)$/u.test(mime.split(';')[0]!)
            ) {
              avatars.set(key, `data:${mime};base64,${encodeBase64(bytes)}`);
              publish();
            }
          },
          () => {},
        )
        .finally(() => {
          clearTimeout(timer);
          avatarLoading.delete(key);
        });
    }
    return {};
  };

  return {
    resource,
    avatar,
    clear() {
      avatars.clear();
      avatarLoading.clear();
    },
  };
}
