import { unwrap, unwrapAsync } from '../../bridge/rpc-result.js';
import type { TakeoverHandoff } from '../../takeover/contracts.js';
import type { TakeoverAdapterMethods } from './methods.js';

export function takeoverList(
  methods: TakeoverAdapterMethods,
  query: {
    slug?: string;
    channelId?: string;
    pendingOnly?: boolean;
    limit?: number;
  },
): { takeovers: TakeoverHandoff[] } {
  return unwrap(methods.takeoverList(query ?? {}));
}

export function takeoverStatus(
  methods: TakeoverAdapterMethods,
  channelId: string,
  messageId: string,
): { takeover: TakeoverHandoff } {
  return unwrap(methods.takeoverStatus({ channelId, messageId }));
}

export async function takeoverRequest(
  methods: TakeoverAdapterMethods,
  slug: string,
  input: { channelId?: string; target: string; title: string; message: string; minutes?: number },
): Promise<{ takeover: TakeoverHandoff }> {
  return unwrapAsync(methods.takeoverRequest({ ...input, slug }));
}

export async function takeoverComplete(
  methods: TakeoverAdapterMethods,
  channelId: string,
  messageId: string,
  outcome: 'done' | 'failed',
  surface?: string,
): Promise<{ takeover: TakeoverHandoff }> {
  return unwrapAsync(methods.takeoverComplete({ channelId, messageId, outcome, surface }));
}

export async function takeoverCancel(
  methods: TakeoverAdapterMethods,
  channelId: string,
  messageId: string,
  surface?: string,
  bot?: string,
): Promise<{ takeover: TakeoverHandoff }> {
  return unwrapAsync(
    methods.takeoverCancel({
      channelId,
      messageId,
      surface,
      ...(bot === undefined ? {} : { bot }),
    }),
  );
}
