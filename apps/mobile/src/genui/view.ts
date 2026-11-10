import {
  initialGenuiDocumentState,
  validateGenuiDocumentState,
  type GenuiDocument,
  type GenuiDocumentState,
} from '../../../../packages/core/src/channels/genui-document';
import { PrivateViewController } from '../../../../packages/client/src/client/genui-view';

export interface GenuiViewClient {
  call<T>(method: string, args?: Record<string, unknown>): Promise<T>;
}

export const GENUI_RETAINED_VIEWS = 32;

export function parseGenuiDocumentView(
  value: unknown,
  document: GenuiDocument,
): { version: number; state: GenuiDocumentState } {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const version = record['version'];
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0)
    throw new Error('Invalid private document view');
  return { version, state: validateGenuiDocumentState(document, record['state']) };
}

export class GenuiDocumentViewModel extends PrivateViewController<GenuiDocumentState> {
  constructor(
    readonly document: GenuiDocument,
    channelId: string,
    messageId: string,
    client?: GenuiViewClient,
  ) {
    super(
      document.snapshotId,
      channelId,
      messageId,
      document.stateContract && client
        ? {
            genuiView: async (channel, message) =>
              parseGenuiDocumentView(
                await client.call('channelGenuiView', { channelId: channel, messageId: message }),
                document,
              ),
            saveGenuiView: async (channel, message, snapshotId, expectedVersion, state) =>
              parseGenuiDocumentView(
                await client.call('channelGenuiViewSave', {
                  channelId: channel,
                  messageId: message,
                  snapshotId,
                  expectedVersion,
                  state: validateGenuiDocumentState(document, state),
                }),
                document,
              ),
          }
        : undefined,
      () => initialGenuiDocumentState(document),
      (value) => validateGenuiDocumentState(document, value),
    );
  }
}

const retained = new WeakMap<GenuiViewClient, Map<string, GenuiDocumentViewModel>>();

function key(channelId: string, messageId: string, document: GenuiDocument): string {
  return JSON.stringify([channelId, messageId, document.snapshotId]);
}

export function genuiDocumentView(
  document: GenuiDocument,
  channelId: string,
  messageId: string,
  client?: GenuiViewClient,
): GenuiDocumentViewModel {
  if (client === undefined || document.stateContract === undefined)
    return new GenuiDocumentViewModel(document, channelId, messageId);
  const cache = retained.get(client) ?? new Map<string, GenuiDocumentViewModel>();
  retained.set(client, cache);
  const id = key(channelId, messageId, document);
  const existing = cache.get(id);
  if (existing) return existing;
  if (cache.size >= GENUI_RETAINED_VIEWS) {
    const disposable = [...cache].find(([, view]) => view.disposable());
    if (!disposable) return new GenuiDocumentViewModel(document, channelId, messageId);
    cache.delete(disposable[0]);
  }
  const view = new GenuiDocumentViewModel(document, channelId, messageId, client);
  cache.set(id, view);
  return view;
}

export function forgetGenuiDocumentViews(
  client: GenuiViewClient,
  channelId: string,
  messageId: string,
): void {
  const cache = retained.get(client);
  if (!cache) return;
  for (const [id, view] of cache)
    if (view.matchesMessage(channelId, messageId)) {
      cache.delete(id);
      view.revoke();
    }
}
