import { afterEach, describe, expect, it, vi } from 'vitest';

import { syntheticGenuiDocument } from '../../../packages/core/test/fixtures/genui-document';
import { initialGenuiDocumentState } from '../../../packages/core/src/channels/genui-document';
import { MethodRefused } from '../src/host/client';
import {
  GENUI_RETAINED_VIEWS,
  forgetGenuiDocumentViews,
  genuiDocumentView,
  type GenuiViewClient,
} from '../src/genui/view';
import {
  genuiRestoreMessage,
  parseGenuiBridgeMessage,
  type GenuiDocumentState,
} from '../src/genui/document';

const document = syntheticGenuiDocument;
const initial = initialGenuiDocumentState(document);
const filtered = (filter: string): GenuiDocumentState => ({
  ...initial,
  values: { ...initial.values, filter },
});

function host(saved: { version: number; state: GenuiDocumentState }) {
  const calls: { method: string; args: Record<string, unknown> }[] = [];
  let conflict = false;
  let unavailable = false;
  const client: GenuiViewClient = {
    async call<T>(method: string, args: Record<string, unknown> = {}) {
      calls.push({ method, args });
      if (unavailable) throw new MethodRefused('genui-unavailable', 'Document unavailable');
      if (method === 'channelGenuiView') return structuredClone(saved) as T;
      if (conflict || args['expectedVersion'] !== saved.version)
        throw new MethodRefused('genui-view-conflict', 'Changed elsewhere');
      saved = { version: saved.version + 1, state: args['state'] as GenuiDocumentState };
      return structuredClone(saved) as T;
    },
  };
  return {
    client,
    calls,
    setConflict: (value: boolean) => (conflict = value),
    setUnavailable: () => (unavailable = true),
    replace: (next: { version: number; state: GenuiDocumentState }) => (saved = next),
  };
}

let unsubscribe: (() => void) | undefined;
afterEach(() => {
  unsubscribe?.();
  unsubscribe = undefined;
  vi.useRealTimers();
});

async function settle() {
  for (let index = 0; index < 5; index++) await Promise.resolve();
}

describe('GenUI mobile private document view', () => {
  it('restores the saved view on open and saves edits through the Host CAS owner', async () => {
    vi.useFakeTimers();
    const fake = host({ version: 3, state: filtered('Beta') });
    const view = genuiDocumentView(document, 'dm-1', 'message-1', fake.client);
    unsubscribe = view.subscribe(() => {});
    await settle();
    expect(view.getSnapshot()).toMatchObject({ status: 'ready', state: filtered('Beta') });
    expect(fake.calls[0]).toEqual({
      method: 'channelGenuiView',
      args: { channelId: 'dm-1', messageId: 'message-1' },
    });
    view.edit(filtered('Gamma'));
    await vi.advanceTimersByTimeAsync(600);
    await settle();
    expect(fake.calls.at(-1)).toEqual({
      method: 'channelGenuiViewSave',
      args: {
        channelId: 'dm-1',
        messageId: 'message-1',
        snapshotId: document.snapshotId,
        expectedVersion: 3,
        state: filtered('Gamma'),
      },
    });
    expect(view.getSnapshot().status).toBe('ready');
    view.reset();
    await vi.advanceTimersByTimeAsync(600);
    await settle();
    expect(fake.calls.at(-1)?.args).toMatchObject({ expectedVersion: 4, state: initial });
  });

  it('surfaces a conflict and saves the kept draft against the newer version', async () => {
    vi.useFakeTimers();
    const fake = host({ version: 1, state: initial });
    const view = genuiDocumentView(document, 'dm-1', 'message-2', fake.client);
    unsubscribe = view.subscribe(() => {});
    await settle();
    fake.replace({ version: 7, state: filtered('Remote') });
    view.edit(filtered('Mine'));
    await vi.advanceTimersByTimeAsync(600);
    await settle();
    expect(view.getSnapshot().status).toBe('conflict');
    await view.keepDraft();
    expect(view.getSnapshot()).toMatchObject({ status: 'conflict-ready', state: filtered('Mine') });
    await view.save();
    expect(fake.calls.at(-1)?.args).toMatchObject({ expectedVersion: 7, state: filtered('Mine') });
    expect(view.getSnapshot().status).toBe('ready');
  });

  it('revokes the view when the Host reports the document unavailable', async () => {
    const fake = host({ version: 0, state: initial });
    fake.setUnavailable();
    const view = genuiDocumentView(document, 'dm-1', 'message-3', fake.client);
    unsubscribe = view.subscribe(() => {});
    await settle();
    expect(view.getSnapshot()).toMatchObject({ available: false, state: initial });
  });

  it('retains one bounded view per message and revokes it on purge', async () => {
    const fake = host({ version: 0, state: initial });
    const first = genuiDocumentView(document, 'dm-1', 'message-4', fake.client);
    expect(genuiDocumentView(document, 'dm-1', 'message-4', fake.client)).toBe(first);
    first.edit(filtered('Unsaved'));
    forgetGenuiDocumentViews(fake.client, 'dm-1', 'message-4');
    expect(first.getSnapshot()).toMatchObject({ available: false, state: initial });
    expect(genuiDocumentView(document, 'dm-1', 'message-4', fake.client)).not.toBe(first);
    const views = Array.from({ length: GENUI_RETAINED_VIEWS + 4 }, (_, index) =>
      genuiDocumentView(document, 'dm-2', `bounded-${index}`, fake.client),
    );
    expect(new Set(views).size).toBe(views.length);
  });

  it('keeps documents without a state contract local and never calls the Host', async () => {
    const fake = host({ version: 0, state: initial });
    const { stateContract: _omit, ...stateless } = document;
    const view = genuiDocumentView(stateless, 'dm-1', 'message-5', fake.client);
    unsubscribe = view.subscribe(() => {});
    await settle();
    expect(view.getSnapshot().status).toBe('ready');
    expect(fake.calls).toHaveLength(0);
  });
});

describe('GenUI mobile state bridge', () => {
  it('accepts only contract-valid state from the current mount', () => {
    const data = (state: unknown, instanceId = 'genui-mobile-1') =>
      JSON.stringify({ instanceId, type: 'state', state });
    expect(parseGenuiBridgeMessage(data(filtered('Beta')), 'genui-mobile-1', document)).toEqual({
      type: 'state',
      state: filtered('Beta'),
    });
    for (const message of [
      data(filtered('Beta'), 'genui-mobile-2'),
      data({ version: 1, values: { ...initial.values, unknown: 'x' } }),
      data({ version: 1, values: { ...initial.values, sort: 'sideways' } }),
      data(filtered('x'.repeat(121))),
    ])
      expect(parseGenuiBridgeMessage(message, 'genui-mobile-1', document)).toBeUndefined();
    expect(parseGenuiBridgeMessage(data(filtered('Beta')), 'genui-mobile-1')).toBeUndefined();
  });

  it('builds a bounded restore message only for valid state', () => {
    const restore = genuiRestoreMessage('genui-mobile-1', document, filtered('Beta'));
    expect(JSON.parse(restore ?? '{}')).toEqual({
      instanceId: 'genui-mobile-1',
      type: 'restore',
      state: filtered('Beta'),
    });
    expect(
      genuiRestoreMessage('genui-mobile-1', document, {
        version: 1,
        values: { filter: 1 },
      } as never),
    ).toBeUndefined();
  });
});
