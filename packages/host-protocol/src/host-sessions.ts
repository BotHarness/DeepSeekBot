import type { QuestionItem } from './wire';
import type { SessionModelChoice } from './session-model';

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
  includeArchived?: boolean;
}

export type HostSessionCreateRequest = (
  | { cwd: string; workspaceId?: never }
  | { workspaceId: string; cwd?: never }
) & {
  text: string;
  sessionId?: string;
  choice?: Extract<SessionModelChoice, { kind: 'model' }>;
};

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
  includeArchived?: true;
  sources?: HostSessionSourceOption[];
}

export type HostSessionStatus = 'running' | 'needs-you' | 'idle';
export type HostSessionAttention = 'approval' | 'question' | 'failed';

export function hostSessionStatus(state: {
  running: boolean;
  attention?: HostSessionAttention | undefined;
}): HostSessionStatus {
  return state.attention !== undefined ? 'needs-you' : state.running ? 'running' : 'idle';
}

export interface HostSessionRow {
  sessionId: string;
  source: HostSessionSource;
  title?: string;
  folderName?: string;
  running: boolean;
  waiting?: true;
  status?: HostSessionStatus;
  attention?: HostSessionAttention;
  archived?: true;
  model?: { provider: string; model: string };
  sortedAt?: number;
  lastPromptAt: number | null;
  updatedAt: number;
}

export type HostSessionApprovalDecision = 'allowed-once' | 'rejected';

export type HostSessionPendingInput =
  | {
      kind: 'approval';
      requestId: string;
      toolName: string;
      callId?: string;
      reason?: string;
    }
  | {
      kind: 'question';
      requestId: string;
      questions: QuestionItem[];
      continued?: true;
    };

export interface HostSessionActionReceipt {
  sessionId: string;
  accepted: true;
}

export function isHostSessionApprovalDecision(
  value: unknown,
): value is HostSessionApprovalDecision {
  return value === 'allowed-once' || value === 'rejected';
}
