import type { TabMenuEntry } from './tab-menu-model';

export type NavigationDestination = {
  key: string;
  focused: boolean;
  activity: boolean;
  settings?: boolean;
  sessions?: boolean;
  count: number;
  onPress(): void;
  menu?: readonly TabMenuEntry[] | undefined;
};
