import type { ComponentType } from 'react';
import type { ModelBrand } from '@botharness/host-client/shared/model-brand';

export interface SessionModelSheetRow {
  key: string;
  name: string;
  brand?: ModelBrand | undefined;
  detail?: string | undefined;
  tag?: string | undefined;
  disabled?: boolean | undefined;
  accessible: string;
}

export interface SessionModelSheetProps {
  visible: boolean;
  title: string;
  closeLabel: string;
  note?: string | undefined;
  failure?: string | undefined;
  retryLabel: string;
  sections: { title: string; data: SessionModelSheetRow[] }[];
  current: string;
  saving?: string | undefined;
  savingLabel: string;
  loading: boolean;
  refreshLabel: string;
  refreshingLabel: string;
  refreshing: boolean;
  onClose(): void;
  onRetry(): void;
  onRefresh(): void;
  onChoose(key: string): void;
}

export const NativeSessionModelSheet: ComponentType<SessionModelSheetProps> | undefined = undefined;
