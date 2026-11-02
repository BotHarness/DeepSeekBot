import type { ReactNode } from 'react';

export type ContextAction = {
  key: string;
  label: string;
  systemImage?: string;
  destructive?: boolean;
  run(): void;
};

export function ContextMenuArea({
  children,
}: {
  actions: readonly ContextAction[];
  children: ReactNode;
  fill?: boolean;
}) {
  return children;
}

export const nativeContextMenu = false;
