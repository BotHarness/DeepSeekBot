import type { ReactNode } from 'react';

export interface NativeHostDrawerProps {
  open: boolean;
  enabled: boolean;
  closeLabel: string;
  panel: ReactNode;
  children: ReactNode;
  onOpenChange(open: boolean): void;
}

export const nativeHostDrawer = false;

export function NativeHostDrawer({ children }: NativeHostDrawerProps) {
  return children;
}
