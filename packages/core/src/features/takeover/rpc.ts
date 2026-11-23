import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
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

export const takeoverRpc = {
  takeoverList(query: {
    slug?: string;
    channelId?: string;
    pendingOnly?: boolean;
    limit?: number;
  }): { takeovers: TakeoverHandoff[] } {
    return takeoverList(this.methods, query);
  },

  takeoverStatus(channelId: string, messageId: string): { takeover: TakeoverHandoff } {
    return takeoverStatus(this.methods, channelId, messageId);
  },

  async takeoverRequest(
    slug: string,
    input: { channelId?: string; target: string; title: string; message: string; minutes?: number },
  ): Promise<{ takeover: TakeoverHandoff }> {
    return takeoverRequest(this.methods, slug, input);
  },

  async takeoverComplete(
    channelId: string,
    messageId: string,
    outcome: 'done' | 'failed',
    surface?: string,
  ): Promise<{ takeover: TakeoverHandoff }> {
    return takeoverComplete(this.methods, channelId, messageId, outcome, surface);
  },

  async takeoverCancel(
    channelId: string,
    messageId: string,
    surface?: string,
    bot?: string,
  ): Promise<{ takeover: TakeoverHandoff }> {
    return takeoverCancel(this.methods, channelId, messageId, surface, bot);
  },
} satisfies ThisType<BridgeRpcReceiver>;
