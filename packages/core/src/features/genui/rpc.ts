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
