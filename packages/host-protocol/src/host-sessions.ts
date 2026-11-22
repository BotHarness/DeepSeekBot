export type HostSessionSource =
  | { kind: 'native' }
  | {
      kind: 'bot';
      botSlug: string;
      displayName: string;
      avatar?: string;
      appearance?: unknown;
      avatarSeed?: 2;
    };

export interface HostSessionRow {
  sessionId: string;
  source: HostSessionSource;
  title?: string;
  folderName?: string;
  running: boolean;
  lastPromptAt: number | null;
  updatedAt: number;
}
