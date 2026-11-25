import { useFocusEffect } from 'expo-router';
import { useCallback, type RefCallback } from 'react';
import type { ViewInstance } from 'react-native';
import { useMounted } from '../../ui/mounted';
import { holdBack } from '../../ui/shell/back-owner';
import { closeSessionDrawer } from './session-drawer-state';

export function useSessionDrawerChrome(): RefCallback<ViewInstance> {
  useFocusEffect(useCallback(() => () => closeSessionDrawer(false), []));
  return useMounted<ViewInstance>(() => {
    const held = holdBack(() => {
      closeSessionDrawer();
      return true;
    });
    return () => held.remove();
  }, []);
}
