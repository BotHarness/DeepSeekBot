import type { ComponentType } from 'react';
import type { ModelBrand } from '@botharness/host-client/shared/model-brand';
import type {
  SessionModelFilter,
  SessionModelSectionId,
  SessionModelSkeletonSection,
} from './session-model-sections';

export interface SessionModelSheetRow {
  key: string;
  name: string;
  brand?: ModelBrand | undefined;
  detail?: string | undefined;
  tag?: string | undefined;
  disabled?: boolean | undefined;
  accessible: string;
  testID?: string | undefined;
}

export interface SessionModelSheetProps {
  visible: boolean;
  title: string;
  closeLabel: string;
  note?: string | undefined;
  failure?: string | undefined;
  retryLabel: string;
  sections: { id: SessionModelSectionId; title: string; data: SessionModelSheetRow[] }[];
  skeleton: SessionModelSkeletonSection[];
  filters: (SessionModelFilter & { accessible: string })[];
  filter: string | undefined;
  filterLabel: string;
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
  onFilter(key: string | undefined): void;
  onChoose(key: string): void;
  selected?: readonly string[] | undefined;
  confirm?: { label: string; disabled: boolean; onPress(): void } | undefined;
  effort?: ModelSheetEffort | undefined;
}

export interface ModelSheetEffort {
  title: string;
  options: { id: string; label: string }[];
  current: string;
  onChoose(id: string): void;
}

export const NativeSessionModelSheet: ComponentType<SessionModelSheetProps> | undefined = undefined;
