import { createContext, useContext } from 'react';

import { motion } from '../design/tokens';

/**
 * A bubble's long-press handler for the media inside it. Images, files and voice
 * rows are their own Pressables, so they take the touch and the bubble's own
 * long press never fires; each one passes this through so holding media still
 * opens the message actions (download, share, reply).
 */
export const MediaLongPress = createContext<(() => void) | undefined>(undefined);

export function useMediaLongPress(): { onLongPress?: () => void; delayLongPress?: number } {
  const onLongPress = useContext(MediaLongPress);
  return onLongPress === undefined ? {} : { onLongPress, delayLongPress: motion.lift };
}
