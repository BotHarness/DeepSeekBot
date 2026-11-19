export interface ModelProviderView {
  id: string;
  name: string;
  keyLast4?: string;
  keyStored: boolean;
  modelCount: number;
  availability: 'available' | 'unavailable' | 'resting';
  restingUntil?: string;
  canRename: boolean;
  canReplaceKey: boolean;
  canRemove: boolean;
  revision: number;
}

export interface ModelProvidersView {
  revision?: number;
  providers: ModelProviderView[];
}

export interface ModelProviderSave {
  id: string;
  keyStored: boolean;
  modelCount: number;
  testReply: 'ok' | 'failed' | 'skipped';
  credentialCleanupPending?: boolean;
}

export interface ModelProviderRemoval {
  id: string;
  credentialCleanupPending?: boolean;
}
