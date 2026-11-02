import type { ReactNode } from 'react';
import { View } from 'react-native';

export const CONVERSATION_AVATAR = 48;
export const CONVERSATION_RING = 6;

export function AvatarSlot({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        width: CONVERSATION_AVATAR + CONVERSATION_RING,
        height: CONVERSATION_AVATAR + CONVERSATION_RING,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  );
}
