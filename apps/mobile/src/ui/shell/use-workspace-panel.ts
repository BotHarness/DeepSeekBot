import { Platform } from 'react-native';
import { openWorkspacePage } from './workspace-paging';

export function useWorkspacePanel(): (() => void) | undefined {
  return Platform.OS === 'ios'
    ? () => {
        openWorkspacePage();
      }
    : undefined;
}
