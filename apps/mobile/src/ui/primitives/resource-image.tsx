import { useState, type ComponentProps } from 'react';
import { Image } from 'expo-image';
import { useMounted } from '../mounted';
import type { RemoteSource } from '../../host/client';
import { encodeBase64 } from '../../host/encrypted-carrier';
import { cachedMediaUri, cacheMedia, mediaCacheAvailable } from '../../host/media-cache';

type Resolved = { uri: string; headers: Record<string, string> };

export function ResourceImage({
  source,
  ...props
}: Omit<ComponentProps<typeof Image>, 'source'> & { source: RemoteSource }) {
  const cacheKey = source.cacheKey;
  const [resolved, setResolved] = useState<Resolved | undefined>(() => {
    if (source.read === undefined || cacheKey === undefined) return undefined;
    const cached = cachedMediaUri(cacheKey);
    return cached === undefined ? undefined : { uri: cached, headers: {} };
  });
  const mount = useMounted<Image>(() => {
    const read = source.read;
    if (!read) return;
    const controller = new AbortController();
    const failed = () => {
      if (!controller.signal.aborted) props.onError?.({ error: 'resource-unavailable' });
    };
    if (cacheKey !== undefined && mediaCacheAvailable()) {
      const cached = cachedMediaUri(cacheKey);
      if (cached !== undefined) {
        setResolved({ uri: cached, headers: {} });
        return;
      }
      setResolved(undefined);
      void cacheMedia({ ...source, cacheKey, read }, controller.signal).then((uri) => {
        if (!controller.signal.aborted) setResolved({ uri, headers: {} });
      }, failed);
      return () => controller.abort();
    }
    setResolved(undefined);
    void read(controller.signal).then(({ bytes, mime }) => {
      if (!controller.signal.aborted)
        setResolved({ uri: `data:${mime};base64,${encodeBase64(bytes)}`, headers: {} });
    }, failed);
    return () => controller.abort();
  }, [source.uri, cacheKey]);
  const direct =
    cacheKey === undefined ? source : { uri: source.uri, headers: source.headers, cacheKey };
  return <Image {...props} ref={mount} source={source.read ? (resolved ?? null) : direct} />;
}
