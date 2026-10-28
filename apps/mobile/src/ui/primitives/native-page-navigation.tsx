import type { ReactNode } from 'react';

export function NativePageNavigation({
  children,
}: {
  children: ReactNode;
  title?: ReactNode;
  onBack(): void;
  backID: string;
  enabled?: boolean;
}) {
  return children;
}
