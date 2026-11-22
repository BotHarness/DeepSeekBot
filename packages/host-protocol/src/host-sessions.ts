export const HOST_SESSION_SORTS = ['last-human-turn', 'created', 'last-activity'] as const;
export type HostSessionSort = (typeof HOST_SESSION_SORTS)[number];
export type HostSessionFilter = 'all' | 'native' | `bot:${string}`;
export const HOST_SESSION_SEARCH_MAX = 200;

export function isHostSessionSort(value: unknown): value is HostSessionSort {
  return HOST_SESSION_SORTS.some((sort) => sort === value);
}

export function isHostSessionFilter(value: unknown): value is HostSessionFilter {
  return (
    value === 'all' ||
    value === 'native' ||
    (typeof value === 'string' && value.startsWith('bot:') && value.slice(4).trim() !== '')
  );
}

export interface HostSessionListOptions {
  search?: string;
  sort?: HostSessionSort;
  source?: HostSessionFilter;
}

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

export type HostSessionSourceOption =
  | { kind: 'native' }
  | { kind: 'bot'; botSlug: string; displayName: string };

export interface HostSessionListResult {
  sessions: HostSessionRow[];
  queryVersion?: 1;
  sources?: HostSessionSourceOption[];
}

export interface HostSessionRow {
  sessionId: string;
  source: HostSessionSource;
  title?: string;
  folderName?: string;
  running: boolean;
  lastPromptAt: number | null;
  updatedAt: number;
}
