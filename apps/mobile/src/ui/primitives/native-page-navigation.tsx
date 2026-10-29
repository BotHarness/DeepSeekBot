import type { ReactNode } from 'react';

export function NativePageNavigation({ children }: { children: ReactNode }) {
  return children;
}
export function NativePageHeader(_props: { title?: ReactNode; onBack(): void; backID: string }) {
  return null;
}
