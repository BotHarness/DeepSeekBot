import { NATIVE_SESSION_ATTENTION_KIND } from '@botharness/host-protocol/wire';
import type { HumanContext } from '../../humans/context.js';
import { attentionSummary } from './human-attention-query.js';
import type {
  HumanAttentionItem,
  HumanAttentionQuery,
  HumanAttentionSource,
} from './human-attention-types.js';

export interface NativeSessionAttentionEntry {
  sessionId: string;
  requestId: string;
  input: 'approval' | 'question';
  summary: string;
  createdAt: string;
  sessionTitle?: string;
}

export interface NativeSessionAttentionSource {
  list(): readonly NativeSessionAttentionEntry[];
  subscribe(changed: () => void): () => void;
}

export interface NativeSessionAttentionOptions {
  source(): NativeSessionAttentionSource | undefined;
  enabled(): boolean;
  owner(human: HumanContext): boolean;
}

export function nativeSessionItemId(entry: Pick<NativeSessionAttentionEntry, 'requestId'>) {
  return `native-session:${entry.requestId}`;
}

function item(entry: NativeSessionAttentionEntry): HumanAttentionItem {
  return {
    id: nativeSessionItemId(entry),
    category: 'action',
    kind: NATIVE_SESSION_ATTENTION_KIND,
    createdAt: entry.createdAt,
    botSlug: '',
    summary: attentionSummary(entry.summary),
    requestId: entry.requestId,
    nativeSession: {
      sessionId: entry.sessionId,
      input: entry.input,
      ...(entry.sessionTitle === undefined ? {} : { sessionTitle: entry.sessionTitle }),
    },
  };
}

type ListInput = Parameters<HumanAttentionQuery['list']>[1];

function wantsNative(input: ListInput): boolean {
  return (
    (input.source === 'all' || input.source === 'native') &&
    input.cursor === undefined &&
    (input.category ?? 'action') === 'action' &&
    (input.kind === undefined || input.kind === NATIVE_SESSION_ATTENTION_KIND) &&
    input.botSlug === undefined &&
    input.channelId === undefined &&
    input.snoozed !== true &&
    input.dismissed !== true
  );
}

export function withNativeSessionAttention(
  query: HumanAttentionQuery,
  options: NativeSessionAttentionOptions,
): HumanAttentionQuery {
  const native = (human: HumanContext, input: ListInput): HumanAttentionItem[] => {
    if (!wantsNative(input) || !options.enabled() || !options.owner(human)) return [];
    const search = input.search?.trim().toLowerCase() ?? '';
    return (options.source()?.list() ?? [])
      .map(item)
      .filter(
        (row) =>
          (input.itemId === undefined || row.id === input.itemId) &&
          (search === '' ||
            `${row.summary} ${row.nativeSession?.sessionTitle ?? ''}`
              .toLowerCase()
              .includes(search)),
      );
  };
  const bot = (input: ListInput) =>
    input.source !== 'native' &&
    (input.kind === undefined || input.kind !== NATIVE_SESSION_ATTENTION_KIND);
  return {
    ...query,
    list(human, input) {
      const { source: _source, ...rest } = input;
      const nativeItems = native(human, input);
      const page = bot(input) ? query.list(human, rest) : { items: [] };
      if (nativeItems.length === 0) return page;
      const sort = input.sort ?? 'oldest';
      const items = [...page.items, ...nativeItems].sort((a, b) => {
        const order = a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
        return sort === 'oldest' ? order : -order;
      });
      return { ...page, items };
    },
    status(human, messageCounts, source) {
      const status = query.status(human, messageCounts);
      if (status.hasAction || (source !== 'all' && source !== 'native')) return status;
      return { ...status, hasAction: native(human, { source }).length > 0 };
    },
  };
}
