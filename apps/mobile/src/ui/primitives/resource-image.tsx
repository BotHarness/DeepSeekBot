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
  const onDisk = cacheKey !== undefined && mediaCacheAvailable();
  const [resolved, setResolved] = useState<Resolved | undefined>(() => {
    const cached = onDisk ? cachedMediaUri(cacheKey) : undefined;
    return cached === undefined ? undefined : { uri: cached, headers: {} };
  });
  const mount = useMounted<Image>(() => {
    if (!onDisk && !source.read) return;
    const controller = new AbortController();
    const failed = () => {
      if (!controller.signal.aborted) props.onError?.({ error: 'resource-unavailable' });
    };
    if (onDisk) {
      const cached = cachedMediaUri(cacheKey);
      if (cached !== undefined) {
        setResolved({ uri: cached, headers: {} });
        return;
      }
      setResolved(undefined);
      void cacheMedia({ ...source, cacheKey }, controller.signal).then((uri) => {
        if (!controller.signal.aborted) setResolved({ uri, headers: {} });
      }, failed);
      return () => controller.abort();
    }
    const read = source.read!;
    setResolved(undefined);
    void read(controller.signal).then(({ bytes, mime }) => {
      if (!controller.signal.aborted)
        setResolved({ uri: `data:${mime};base64,${encodeBase64(bytes)}`, headers: {} });
    }, failed);
    return () => controller.abort();
  }, [source.uri, cacheKey, onDisk]);
  if (onDisk)
    return <Image {...props} cachePolicy="memory" ref={mount} source={resolved ?? null} />;
  return <Image {...props} ref={mount} source={source.read ? (resolved ?? null) : source} />;
}
