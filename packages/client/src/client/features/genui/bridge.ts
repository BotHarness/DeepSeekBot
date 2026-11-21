import * as channelHost from '@botharness/host-client/channel-messages';
import {
  loadGenuiDocumentView as loadGenuiDocumentViewFrom,
  parseGenuiDocumentView as parseHostGenuiDocumentView,
  saveGenuiDocumentView as saveGenuiDocumentViewTo,
} from '@botharness/host-client/genui/view';
import { asRecord, bridgeHost, type BridgeCall } from '../../bridge-transport.js';

type GenuiDocument = Parameters<typeof parseHostGenuiDocumentView>[1];
type GenuiDocumentState = ReturnType<typeof parseHostGenuiDocumentView>['state'];

export function parseGenuiDocumentView(
  value: unknown,
  document: GenuiDocument,
): {
  version: number;
  state: GenuiDocumentState;
} {
  return parseHostGenuiDocumentView(value, document);
}

export async function loadGenuiDocumentView(
  call: BridgeCall,
  channelId: string,
  messageId: string,
  document: GenuiDocument,
) {
  return loadGenuiDocumentViewFrom(bridgeHost(call), channelId, messageId, document);
}

export async function saveGenuiDocumentView(
  call: BridgeCall,
  channelId: string,
  messageId: string,
  document: GenuiDocument,
  expectedVersion: number,
  state: GenuiDocumentState,
) {
  return saveGenuiDocumentViewTo(
    bridgeHost(call),
    channelId,
    messageId,
    document,
    expectedVersion,
    state,
  );
}

export interface GenuiView<State> {
  version: number;
  state: State;
}

export function createGenuiReportBridge<GenuiViewState>(genuiViewSchema: {
  parse(state: unknown): GenuiViewState;
  safeParse(state: unknown): { success: true; data: GenuiViewState } | { success: false };
}) {
  function genuiViewState(state: unknown): GenuiViewState {
    const parsed = genuiViewSchema.safeParse(state);
    if (!parsed.success) throw new Error('Invalid private report view');
    return parsed.data;
  }

  function parseGenuiView(value: unknown): GenuiView<GenuiViewState> {
    const record = asRecord(value);
    const version = record?.['version'];
    if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0)
      throw new Error('Invalid private report view');
    return { version, state: genuiViewState(record?.['state']) };
  }

  async function loadGenuiView(
    call: BridgeCall,
    channelId: string,
    messageId: string,
  ): Promise<GenuiView<GenuiViewState>> {
    return channelHost.loadPrivateView(bridgeHost(call), channelId, messageId, genuiViewState);
  }

  async function saveGenuiView(
    call: BridgeCall,
    channelId: string,
    messageId: string,
    snapshotId: string,
    expectedVersion: number,
    state: GenuiViewState,
  ): Promise<GenuiView<GenuiViewState>> {
    return channelHost.savePrivateView(
      bridgeHost(call),
      { channelId, messageId, snapshotId, expectedVersion, state: genuiViewSchema.parse(state) },
      genuiViewState,
    );
  }

  return { parseGenuiView, loadGenuiView, saveGenuiView };
}
