export type NavigationDestination = {
  key: string;
  focused: boolean;
  activity: boolean;
  settings?: boolean;
  sessions?: boolean;
  count: number;
  onPress(): void;
  onLongPress(): void;
};
