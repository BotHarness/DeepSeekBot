import type { ComponentType } from 'react';
import type { ModelBrand } from '@botharness/host-client/shared/model-brand';
import type {
  SessionModelEffort,
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
  effort?: SessionModelEffort | undefined;
  effortLabel: string;
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
  onEffort(effort: string): void;
  onChoose(key: string): void;
}

export const NativeSessionModelSheet: ComponentType<SessionModelSheetProps> | undefined = undefined;
