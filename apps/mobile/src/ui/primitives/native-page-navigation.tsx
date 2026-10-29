import type { ReactNode } from 'react';

export function NativePageNavigation({ children }: { children: ReactNode }) {
  return children;
}
export type NativePageHeaderProps = {
  title?: ReactNode;
  onBack(): void;
  backID: string;
  action?: { label: string; testID: string; onPress(): void } | undefined;
};
export function NativePageHeader(_props: NativePageHeaderProps) {
  return null;
}
