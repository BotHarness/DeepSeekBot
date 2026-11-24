import { useNavigation, useSegments } from 'expo-router';

export function useSessionDrawerRoot(): boolean {
  const segments: readonly string[] = useSegments();
  const navigation = useNavigation();
  return segments.includes('(sessions)') && (navigation.getState()?.index ?? 0) === 0;
}

export function useInSessionsTab(): boolean {
  const segments: readonly string[] = useSegments();
  return segments.includes('(sessions)');
}
