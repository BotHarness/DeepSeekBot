import { useState } from 'react';
import { Platform } from 'react-native';

export function useChatInitialScroll(openLatest: boolean, count: number, loaded?: boolean) {
  const openAtLatest =
    Platform.OS === 'ios' && process.env.EXPO_PUBLIC_IOS_OPEN_AT_LATEST !== '0' && openLatest;
  const [loadedEmpty, setLoadedEmpty] = useState(loaded === true ? count === 0 : undefined);
  if (loadedEmpty === undefined && loaded === true) setLoadedEmpty(count === 0);
  const [openedAtLatest, setOpenedAtLatest] = useState(false);
  const remount = openAtLatest && loadedEmpty !== true;
  if (!openedAtLatest && remount && count > 0) setOpenedAtLatest(true);
  return {
    key: openedAtLatest || (remount && count > 0) ? 'rows' : 'list',
    ...(Platform.OS === 'android'
      ? { initialNumToRender: 6, maxToRenderPerBatch: 6, windowSize: 5 }
      : remount
        ? { initialScrollIndex: Math.max(0, count - 1), initialNumToRender: 4 }
        : {}),
  };
}
