import { useFocusEffect, useNavigation, useSegments } from 'expo-router';
import { useCallback, useRef } from 'react';
import { useSessionNavigationStyle } from '../../ui/interface-preferences';
import { restackSessions } from './session-landing';

export function useSessionDrawerRoot(): boolean {
  const segments: readonly string[] = useSegments();
  const navigation = useNavigation();
  const style = useSessionNavigationStyle();
  return (
    style === 'drawer' &&
    segments.includes('(sessions)') &&
    (navigation.getState()?.index ?? 0) === 0
  );
}

export function useInSessionsTab(): boolean {
  const segments: readonly string[] = useSegments();
  return segments.includes('(sessions)');
}

export function useRestackOnStyleChange(): void {
  const style = useSessionNavigationStyle();
  const inSessions = useInSessionsTab();
  const navigation = useNavigation();
  const previous = useRef(style);
  useFocusEffect(
    useCallback(() => {
      if (previous.current === style) return;
      previous.current = style;
      if (!inSessions) return;
      const state = navigation.getState();
      if (state === undefined) return;
      const routes = restackSessions(style, {
        index: state.index,
        routes: state.routes.map((entry) => ({
          key: entry.key,
          name: entry.name,
          params: entry.params,
        })),
      });
      if (routes !== undefined) navigation.reset({ index: routes.length - 1, routes } as never);
    }, [style, inSessions, navigation]),
  );
}
