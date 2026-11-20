import type { ReactNode } from 'react';

export type DrawerListItemProps = {
  label: string;
  detail?: string;
  detailDot?: string;
  singleLine?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  selected?: boolean;
  disabled?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress(): void;
  onLongPress?(): void;
};

export function DrawerListItem(_props: DrawerListItemProps) {
  return null;
}
