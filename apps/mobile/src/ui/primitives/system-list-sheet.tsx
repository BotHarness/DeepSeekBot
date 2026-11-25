import type { ComponentType, ReactElement } from 'react';
import type { ImageProps } from '@expo/ui/swift-ui';

export type SystemListRow =
  | {
      kind: 'choice';
      key: string;
      label: string;
      accessibilityLabel?: string | undefined;
      testID?: string | undefined;
      detail?: string | undefined;
      value?: string | undefined;
      systemImage?: ImageProps['systemName'] | undefined;
      leading?: { size: number; node: ReactElement } | undefined;
      selected?: boolean | undefined;
      busy?: boolean | undefined;
      accessory?: 'add' | 'chevron' | undefined;
      muted?: boolean | undefined;
      destructive?: boolean | undefined;
      disabled?: boolean | undefined;
      onPress(): void;
    }
  | { kind: 'toggle'; key: string; label: string; value: boolean; onChange(value: boolean): void }
  | { kind: 'action'; key: string; label: string; onPress(): void }
  | { kind: 'note'; key: string; text: string; tone?: 'label' | 'danger' | 'warning' | undefined }
  | { kind: 'progress'; key: string; label: string };

export type SystemListSection = {
  key: string;
  title?: string | undefined;
  footer?: string | undefined;
  rows: SystemListRow[];
};

export interface SystemListSheetProps {
  visible: boolean;
  title: string;
  closeLabel: string;
  sections: SystemListSection[];
  confirm?: { label: string; disabled?: boolean | undefined; onPress(): void } | undefined;
  onClose(): void;
  onDismissed?: (() => void) | undefined;
}

export const SystemListSheet: ComponentType<SystemListSheetProps> | undefined = undefined;
