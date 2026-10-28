import type { ReactNode } from 'react';

export type EndSheetProps = {
  open: boolean;
  active: boolean;
  enabled: boolean;
  fullWidth?: boolean;
  panel: ReactNode;
  children: ReactNode;
  onOpening?(): void;
  onOpenChange(open: boolean): void;
};

export function EndSheet({ children }: EndSheetProps) {
  return children;
}
