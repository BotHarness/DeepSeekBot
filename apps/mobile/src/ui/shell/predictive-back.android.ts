import { requireOptionalNativeModule } from 'expo';
import { useNavigationContainerRef } from 'expo-router';
import { AppState } from 'react-native';

import { useMounted } from '../mounted';
import { backHeld, watchBackHeld } from './back-owner';

const native = requireOptionalNativeModule<{ setIntercept(enabled: boolean): Promise<boolean> }>(
  'PredictiveBack',
);

function intercept(enabled: boolean) {
  void native?.setIntercept(enabled).catch(() => undefined);
}

export function usePredictiveBack() {
  const navigation = useNavigationContainerRef();
  return useMounted<unknown>(() => {
    if (native === null) return;
    let last: boolean | undefined;
    const apply = (force = false) => {
      const next = backHeld() || (navigation.isReady() && navigation.canGoBack());
      if (!force && next === last) return;
      last = next;
      intercept(next);
    };
    apply(true);
    const offState = navigation.addListener('state', () => apply());
    const offHeld = watchBackHeld(() => apply());
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') apply(true);
    });
    return () => {
      offState();
      offHeld();
      app.remove();
      intercept(true);
    };
  }, [navigation]);
}
