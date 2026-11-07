import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenuiError } from '../../core/src/channels/genui.js';
import {
  initialGenuiDocumentState,
  parseGenuiDocument,
} from '../../core/src/channels/genui-document.js';
import {
  getGenuiDocumentView,
  type GenuiDocumentActions,
} from '../src/client/genui-document-view.js';

const document = parseGenuiDocument({
  version: 2,
  snapshotId: 'document-1',
  title: 'Synthetic document',
  observedAt: '2026-11-08T00:00:00Z',
  html: '<p>Synthetic</p>',
  stateContract: { version: 1, fields: { query: { type: 'string', initial: '', maxLength: 20 } } },
});
const initial = initialGenuiDocumentState(document);
const edited = { version: 1 as const, values: { query: 'local' } };
const remote = { version: 1 as const, values: { query: 'remote' } };
let actions: GenuiDocumentActions;
const releases: Array<() => void> = [];
const unavailable = () => new GenuiError('genui-unavailable', 'Unavailable');

beforeEach(() => {
  vi.useFakeTimers();
  actions = {
    genuiDocumentView: vi.fn(async () => ({ version: 0, state: initial })),
    saveGenuiDocumentView: vi.fn(async (_channel, _message, _document, version, state) => ({
      version: version + 1,
      state,
    })),
    sendGenuiDocumentReply: vi.fn(async () => {}),
  };
});
afterEach(() => {
  for (const release of releases.splice(0)) release();
  vi.useRealTimers();
});

async function mount() {
  const view = getGenuiDocumentView(document, 'dm-1', 'message-1', actions);
  releases.push(view.subscribe(() => {}));
  await vi.advanceTimersByTimeAsync(0);
  return view;
}

describe('document private view', () => {
  it('bounds retained controllers without evicting dirty private drafts', () => {
    for (let index = 0; index < 32; index++) {
      getGenuiDocumentView(document, 'dm-1', `message-${index}`, actions).edit(edited);
    }
    expect(() => getGenuiDocumentView(document, 'dm-1', 'overflow', actions)).toThrow('capacity');
    expect(
      getGenuiDocumentView(document, 'dm-1', 'message-0', actions).getSnapshot().state,
    ).toEqual(edited);
    const otherHumanActions = { ...actions };
    expect(
      getGenuiDocumentView(document, 'dm-1', 'message-0', otherHumanActions).getSnapshot().state,
    ).toEqual(initial);
  });
  it('saves only registered primitive state against the exact snapshot and CAS version', async () => {
    const view = await mount();
    expect(() => view.edit({ version: 1, values: { invented: 'field' } })).toThrow();
    view.edit(edited);
    await vi.advanceTimersByTimeAsync(600);
    expect(actions.saveGenuiDocumentView).toHaveBeenCalledWith(
      'dm-1',
      'message-1',
      document,
      0,
      edited,
    );
    expect(actions.sendGenuiDocumentReply).not.toHaveBeenCalled();
  });

  it('retains dirty drafts across remount and requires explicit CAS conflict resolution', async () => {
    const view = await mount();
    view.edit(edited);
    releases.pop()?.();
    vi.mocked(actions.genuiDocumentView).mockResolvedValue({ version: 2, state: remote });
    expect(await mount()).toBe(view);
    expect(view.getSnapshot()).toMatchObject({ state: edited, status: 'conflict' });
    await view.save();
    await vi.advanceTimersByTimeAsync(1000);
    expect(actions.saveGenuiDocumentView).not.toHaveBeenCalled();
    await view.keepDraft();
    expect(view.getSnapshot().status).toBe('conflict-ready');
    await vi.advanceTimersByTimeAsync(1000);
    expect(actions.saveGenuiDocumentView).not.toHaveBeenCalled();
    await view.save();
    expect(actions.saveGenuiDocumentView).toHaveBeenCalledWith(
      'dm-1',
      'message-1',
      document,
      2,
      edited,
    );
  });

  it('reload explicitly discards a draft and reset saves contract defaults', async () => {
    const view = await mount();
    view.edit(edited);
    vi.mocked(actions.genuiDocumentView).mockResolvedValue({ version: 2, state: remote });
    await view.reload();
    expect(view.getSnapshot().state).toEqual(remote);
    view.reset();
    await vi.advanceTimersByTimeAsync(600);
    expect(actions.saveGenuiDocumentView).toHaveBeenLastCalledWith(
      'dm-1',
      'message-1',
      document,
      2,
      initial,
    );
  });

  it('retains load and save errors without silently replacing drafts', async () => {
    vi.mocked(actions.genuiDocumentView).mockRejectedValueOnce(new Error('offline'));
    const view = await mount();
    expect(view.getSnapshot().status).toBe('load-error');
    await view.reload();
    vi.mocked(actions.saveGenuiDocumentView).mockRejectedValueOnce(new Error('offline'));
    view.edit(edited);
    await vi.advanceTimersByTimeAsync(600);
    expect(view.getSnapshot()).toMatchObject({ status: 'save-error', state: edited });
    await view.save();
    expect(view.getSnapshot().status).toBe('ready');
  });

  it.each(['load', 'save', 'keep', 'send'])(
    'wipes drafts and submission attempts on access loss during %s',
    async (operation) => {
      const view = await mount();
      view.edit(edited);
      await view.send('continue', 'Continue');
      if (operation === 'load') {
        vi.mocked(actions.genuiDocumentView).mockRejectedValue(unavailable());
        await view.reload();
      } else if (operation === 'save') {
        vi.mocked(actions.saveGenuiDocumentView).mockRejectedValue(unavailable());
        await view.save();
      } else if (operation === 'keep') {
        vi.mocked(actions.genuiDocumentView).mockRejectedValue(unavailable());
        await view.keepDraft();
      } else {
        vi.mocked(actions.sendGenuiDocumentReply).mockRejectedValue(unavailable());
        await view.send('refresh', 'Refresh');
      }
      expect(view.getSnapshot()).toMatchObject({
        status: 'load-error',
        state: initial,
        available: false,
        sendStatus: 'idle',
      });
      expect(view.attempts).toEqual({ continue: undefined, refresh: undefined });
    },
  );

  it('retries an uncertain submission with one stable UUID and v2 metadata', async () => {
    const view = await mount();
    vi.mocked(actions.sendGenuiDocumentReply).mockRejectedValueOnce(new Error('unknown outcome'));
    view.edit(edited);
    await view.send('continue', 'Continue');
    const first = vi.mocked(actions.sendGenuiDocumentReply).mock.calls[0];
    await view.send('continue', 'Continue');
    expect(vi.mocked(actions.sendGenuiDocumentReply).mock.calls[1]).toEqual(first);
    expect(first?.[3]).toEqual({
      version: 2,
      messageId: 'message-1',
      snapshotId: document.snapshotId,
      state: edited,
      intent: 'continue',
    });
    await view.send('continue', 'Continue');
    expect(actions.sendGenuiDocumentReply).toHaveBeenCalledTimes(2);
    view.edit(remote);
    await view.send('continue', 'Continue');
    expect(vi.mocked(actions.sendGenuiDocumentReply).mock.calls[2]?.[2]).not.toBe(first?.[2]);
  });

  it('does not claim state recovery or call private-view RPC without a contract', async () => {
    const plain = parseGenuiDocument({ ...document, stateContract: undefined });
    const view = getGenuiDocumentView(plain, 'dm-1', 'plain', actions);
    releases.push(view.subscribe(() => {}));
    await vi.advanceTimersByTimeAsync(1000);
    expect(actions.genuiDocumentView).not.toHaveBeenCalled();
    expect(view.getSnapshot().state).toEqual({ version: 1, values: {} });
    await view.send('refresh', 'Refresh');
    expect(actions.sendGenuiDocumentReply).toHaveBeenCalled();
  });
});
