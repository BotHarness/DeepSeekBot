import type { ReactNode } from 'react';
import { View } from 'react-native';

export interface CreationFormProps {
  nativeDialog?: boolean;
  title: string;
  children: ReactNode;
  onDismiss(): void;
  dismissLabel?: string;
  action?: { label: string; onPress(): void; disabled: boolean; testID?: string } | undefined;
}
export function CreationForm({ children }: CreationFormProps) {
  return <View style={{ flex: 1 }}>{children}</View>;
}
