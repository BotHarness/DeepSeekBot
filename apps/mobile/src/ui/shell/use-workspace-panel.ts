import { useNavigation } from 'expo-router';
import type { BottomTabNavigationProp } from 'expo-router/js-tabs';
import type { NavigationState, ParamListBase } from 'expo-router/react-navigation';
import { useLayoutEffect } from 'react';
import { Platform } from 'react-native';

import { usesWorkspacePanel, withWorkspacePanel } from './workspace-panel-root';

export function useWorkspacePanel(): (() => void) | undefined {
  const navigation = useNavigation();
  const panel = usesWorkspacePanel(Platform.OS);
  useLayoutEffect(() => {
    if (!panel) return;
    const state = navigation.getState();
    const next = state && withWorkspacePanel(state);
    if (state && next)
      navigation.dispatch({
        type: 'RESET',
        payload: next as NavigationState,
        target: state.key,
      });
  }, [navigation, panel]);
  useLayoutEffect(() => {
    if (!panel) return;
    const tabs = navigation.getParent<BottomTabNavigationProp<ParamListBase>>();
    return tabs?.addListener('tabPress', (event) => {
      if (navigation.isFocused()) event.preventDefault();
    });
  }, [navigation, panel]);
  return panel ? () => navigation.goBack() : undefined;
}
