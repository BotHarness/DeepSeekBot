import { useContext, type ReactNode } from 'react';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { useMounted } from '../mounted';
import { ChatsPagingContext } from './chats-paging';

export function LastChatSwipe({
  enabled,
  children,
}: {
  enabled: boolean;
  travel: SharedValue<number>;
  children: ReactNode;
}) {
  const setEnabled = useContext(ChatsPagingContext);
  const mount = useMounted<unknown>(() => {
    setEnabled?.(enabled);
    return () => setEnabled?.(false);
  }, [enabled, setEnabled]);
  return (
    <View ref={mount} style={{ flex: 1 }}>
      {children}
    </View>
  );
}

export function LastChatPreview(_props: { travel: SharedValue<number> }) {
  return null;
}
