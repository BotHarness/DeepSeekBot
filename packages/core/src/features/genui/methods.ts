import {
  asNonBlank,
  asObject,
  invalidInput,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import { GenuiError, type GenuiPrivateView } from '../../channels/genui.js';
import type { ChannelStore } from '../../channels/store.js';
import type { HumanContext } from '../../humans/context.js';

export interface GenuiBridgeMethods {
  channelGenuiView(payload: unknown): BridgeResult<GenuiPrivateView>;
  channelGenuiViewSave(payload: unknown): BridgeResult<GenuiPrivateView>;
}

export function createGenuiBridgeMethods(
  human: HumanContext,
  deps: { channels: Pick<ChannelStore, 'genuiView' | 'saveGenuiView'> },
): GenuiBridgeMethods {
  return {
    channelGenuiView(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      if (!channelId || !messageId || deps.channels.genuiView === undefined)
        return invalidInput('Report view is unavailable');
      try {
        return {
          ok: true,
          value: deps.channels.genuiView(human, channelId, messageId),
        };
      } catch (error) {
        if (error instanceof GenuiError)
          return {
            ok: false,
            error: { code: error.code, message: error.message },
          };
        throw error;
      }
    },
    channelGenuiViewSave(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      const snapshotId = asNonBlank(source, 'snapshotId');
      const expectedVersion = source['expectedVersion'];
      if (
        !channelId ||
        !messageId ||
        !snapshotId ||
        typeof expectedVersion !== 'number' ||
        deps.channels.saveGenuiView === undefined
      )
        return invalidInput('Report view and expectedVersion are required');
      try {
        return {
          ok: true,
          value: deps.channels.saveGenuiView(
            human,
            channelId,
            messageId,
            snapshotId,
            expectedVersion,
            source['state'],
          ),
        };
      } catch (error) {
        if (error instanceof GenuiError)
          return {
            ok: false,
            error: { code: error.code, message: error.message },
          };
        throw error;
      }
    },
  };
}
