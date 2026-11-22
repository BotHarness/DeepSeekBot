import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
import { unwrap } from '../../bridge/rpc-result.js';
import type { GenuiDocumentState } from '../../channels/genui-document.js';
import type { GenuiPrivateView, GenuiViewState } from '../../channels/genui.js';
import type { GenuiBridgeMethods } from './methods.js';

export function channelGenuiView(
  methods: GenuiBridgeMethods,
  channelId: string,
  messageId: string,
): GenuiPrivateView {
  return unwrap(methods.channelGenuiView({ channelId, messageId }));
}

export function channelGenuiViewSave(
  methods: GenuiBridgeMethods,
  channelId: string,
  messageId: string,
  snapshotId: string,
  expectedVersion: number,
  state: GenuiViewState | GenuiDocumentState,
): GenuiPrivateView {
  return unwrap(
    methods.channelGenuiViewSave({
      channelId,
      messageId,
      snapshotId,
      expectedVersion,
      state,
    }),
  );
}

export const genuiServiceRpc = {
  channelGenuiView(channelId: string, messageId: string): GenuiPrivateView {
    return channelGenuiView(this.methods, channelId, messageId);
  },

  channelGenuiViewSave(
    channelId: string,
    messageId: string,
    snapshotId: string,
    expectedVersion: number,
    state: GenuiViewState | GenuiDocumentState,
  ): GenuiPrivateView {
    return channelGenuiViewSave(
      this.methods,
      channelId,
      messageId,
      snapshotId,
      expectedVersion,
      state,
    );
  },
} satisfies ThisType<BridgeRpcReceiver>;
