import {
  genuiDocumentIdentity,
  initialGenuiDocumentState,
  validateGenuiDocumentState,
  type GenuiDocument,
  type GenuiDocumentState,
  type GenuiDocumentReply,
} from '../../../core/src/channels/genui-document.js';
import type { BridgeActions } from './actions.js';
import { PrivateViewController } from './genui-view.js';

export type GenuiDocumentActions = Pick<
  BridgeActions,
  'genuiDocumentView' | 'saveGenuiDocumentView' | 'sendGenuiDocumentReply'
>;

const retained = new WeakMap<GenuiDocumentActions, Map<string, GenuiDocumentView>>();

export function getGenuiDocumentView(
  document: GenuiDocument,
  channelId: string,
  messageId: string,
  actions?: GenuiDocumentActions,
): GenuiDocumentView {
  if (!actions) return new GenuiDocumentView(document, channelId, messageId);
  const cache = retained.get(actions) ?? new Map<string, GenuiDocumentView>();
  retained.set(actions, cache);
  const key = JSON.stringify([channelId, messageId, genuiDocumentIdentity(document)]);
  const existing = cache.get(key);
  if (existing) return existing;
  if (cache.size >= 32) {
    const disposable = [...cache].find(([, view]) => view.disposable());
    if (!disposable) throw new Error('Private document draft capacity reached.');
    cache.delete(disposable[0]);
  }
  const controller = new GenuiDocumentView(document, channelId, messageId, actions);
  cache.set(key, controller);
  return controller;
}

export class GenuiDocumentView extends PrivateViewController<GenuiDocumentState> {
  readonly scopeId = crypto.randomUUID();
  constructor(
    readonly document: GenuiDocument,
    private documentChannelId: string,
    private documentMessageId: string,
    private documentActions?: GenuiDocumentActions,
  ) {
    super(
      document.snapshotId,
      documentChannelId,
      documentMessageId,
      document.stateContract && documentActions
        ? {
            genuiView: (channel, message) =>
              documentActions.genuiDocumentView(channel, message, document),
            saveGenuiView: (channel, message, _snapshot, version, state) =>
              documentActions.saveGenuiDocumentView(channel, message, document, version, state),
          }
        : undefined,
      () => initialGenuiDocumentState(document),
      (value) => validateGenuiDocumentState(document, value),
    );
  }

  send = async (intent: GenuiDocumentReply['intent'], body: string) => {
    const snapshot = this.getSnapshot();
    if (
      !this.documentActions ||
      snapshot.sendStatus === 'sending' ||
      !['ready', 'saving'].includes(snapshot.status)
    )
      return;
    const state = validateGenuiDocumentState(this.document, snapshot.state);
    const reply: GenuiDocumentReply = {
      version: 2,
      messageId: this.documentMessageId,
      snapshotId: this.document.snapshotId,
      intent,
      state: {
        version: 1,
        values: Object.fromEntries(
          Object.entries(state.values).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0,
          ),
        ),
      },
    };
    const payload = JSON.stringify({ reply, body });
    const previous = this.attempts[intent];
    const attempt =
      previous?.payload === payload
        ? previous
        : { payload, id: `human-${crypto.randomUUID()}`, sent: false };
    this.attempts[intent] = attempt;
    if (attempt.sent) return;
    this.setSendStatus('sending');
    try {
      await this.documentActions.sendGenuiDocumentReply(
        this.documentChannelId,
        body,
        attempt.id,
        reply,
      );
      if (this.attempts[intent] !== attempt) return;
      attempt.sent = true;
      this.setSendStatus('sent');
    } catch (error) {
      if (this.attempts[intent] === attempt && !this.accessLost(error)) this.setSendStatus('error');
    }
  };
}
