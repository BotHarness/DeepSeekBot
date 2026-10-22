import { useState, type ComponentProps } from 'react';
import { Image } from 'expo-image';
import { useMounted } from '../mounted';
import type { RemoteSource } from '../../host/client';
import { encodeBase64 } from '../../host/encrypted-carrier';

export function ResourceImage({
  source,
  ...props
}: Omit<ComponentProps<typeof Image>, 'source'> & { source: RemoteSource }) {
  const [resolved, setResolved] = useState<{ uri: string; headers: Record<string, string> }>();
  const mount = useMounted<Image>(() => {
    if (!source.read) return;
    const controller = new AbortController();
    setResolved(undefined);
    void source.read(controller.signal).then(
      ({ bytes, mime }) => {
        if (!controller.signal.aborted)
          setResolved({ uri: `data:${mime};base64,${encodeBase64(bytes)}`, headers: {} });
      },
      () => {
        if (!controller.signal.aborted) props.onError?.({ error: 'resource-unavailable' });
      },
    );
    return () => controller.abort();
  }, [source.uri]);
  return <Image {...props} ref={mount} source={source.read ? (resolved ?? null) : source} />;
}
