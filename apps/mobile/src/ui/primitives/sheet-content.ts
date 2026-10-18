import { useNavigation } from 'expo-router';
import type { NativeStackNavigationProp } from 'expo-router/native-stack';
import type { ParamListBase } from 'expo-router/react-navigation';
import { useState } from 'react';
import type { ViewInstance } from 'react-native';

import { useMounted } from '../mounted';

const OPEN_FALLBACK_MS = 600;

export function useSheetContent() {
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>('/');
  const [ready, setReady] = useState(false);
  const mount = useMounted<ViewInstance>(() => {
    const timer = setTimeout(() => setReady(true), OPEN_FALLBACK_MS);
    const stop = navigation.addListener('transitionEnd', (event) => {
      if (event.data.closing) return;
      clearTimeout(timer);
      setReady(true);
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [navigation]);
  return { ready, mount };
}
