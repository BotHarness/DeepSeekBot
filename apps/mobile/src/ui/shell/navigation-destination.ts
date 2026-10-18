export type NavigationDestination = {
  key: string;
  focused: boolean;
  activity: boolean;
  search?: boolean;
  count: number;
  onPress(): void;
  onLongPress(): void;
};
