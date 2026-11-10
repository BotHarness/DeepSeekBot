import { createContext, useContext } from 'react';

import { motion } from '../design/tokens';

export const MediaLongPress = createContext<(() => void) | undefined>(undefined);

export function useMediaLongPress(): { onLongPress?: () => void; delayLongPress?: number } {
  const onLongPress = useContext(MediaLongPress);
  return onLongPress === undefined ? {} : { onLongPress, delayLongPress: motion.lift };
}
