import { startTransition, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useMounted } from '../mounted';

export function DeferredContent({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const mounted = useMounted(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => startTransition(() => setReady(true)));
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <View ref={mounted} style={{ flex: 1 }}>
      {ready ? children : fallback}
    </View>
  );
}
