import { describe, expect, it } from 'vitest';
import {
  WindowZoom,
  WINDOW_ZOOM_KEY,
  parseZoomDocument,
  parseZoomOperation,
  zoomPercent,
} from '../src/client/window-zoom.js';
function fixture() {
  const values = new Map<string, string>();
  let fail = false;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (fail) throw new Error('disk full');
      values.set(key, value);
    },
  };
  const rendered: number[] = [];
  const owner = new WindowZoom(storage, (level) => {
    rendered.push(level);
  });
  return {
    values,
    storage,
    rendered,
    owner,
    fail: () => {
      fail = true;
    },
  };
}
describe('device-local primary window zoom', () => {
  it('keeps default separate, resets to it and restores the actual window after process recreation', () => {
    const f = fixture();
    f.owner.execute({ type: 'default', level: 1 });
    f.owner.execute({ type: 'step', delta: 1 });
    const restarted = new WindowZoom(f.storage, (level) => {
      f.rendered.push(level);
    });
    expect(restarted.getSnapshot().document).toMatchObject({ defaultLevel: 1, primaryLevel: 2 });
    restarted.execute({ type: 'reset' });
    expect(f.rendered.at(-1)).toBe(1);
    expect(zoomPercent(1)).toBe('120%');
  });
  it('clamps at both limits without revision churn and round trips integer levels', () => {
    const { owner } = fixture();
    owner.execute({ type: 'set', level: 8 });
    const revision = owner.getSnapshot().document.revision;
    owner.execute({ type: 'step', delta: 1 });
    expect(owner.getSnapshot().document.revision).toBe(revision);
    for (let n = 0; n < 25; n++) owner.execute({ type: 'step', delta: -1 });
    expect(owner.getSnapshot().document.primaryLevel).toBe(-8);
    for (let n = 0; n < 8; n++) owner.execute({ type: 'step', delta: 1 });
    expect(zoomPercent(owner.getSnapshot().document.primaryLevel)).toBe('100%');
  });
  it('refuses stale control writes and does not render or report success on failed persistence', () => {
    const f = fixture();
    f.owner.execute({ type: 'set', level: 1 });
    expect(() => f.owner.execute({ type: 'set', level: 2 }, 'initial')).toThrow(
      'zoom-revision-conflict',
    );
    f.fail();
    expect(() => f.owner.execute({ type: 'default', level: 2 })).toThrow(
      'zoom-storage-unavailable',
    );
    expect(f.rendered).toEqual([0, 1]);
    expect(parseZoomDocument(f.storage.getItem(WINDOW_ZOOM_KEY))).toMatchObject({
      defaultLevel: 0,
      primaryLevel: 1,
    });
  });
  it('preserves malformed storage and refuses mutation instead of silently replacing it', () => {
    const f = fixture();
    f.values.set(WINDOW_ZOOM_KEY, '{broken');
    const reopened = new WindowZoom(f.storage, () => {
      throw Error('must not apply');
    });
    expect(reopened.getSnapshot().error).toBe('zoom-storage-invalid');
    expect(() => reopened.execute({ type: 'reset' })).toThrow('zoom-storage-invalid');
    expect(f.values.get(WINDOW_ZOOM_KEY)).toBe('{broken');
  });
  it('reconciles the final saved level on visibility without replaying actions or saving again', () => {
    const f = fixture();
    f.owner.visibilityChanged('hidden');
    f.owner.execute({ type: 'set', level: 2 });
    f.owner.execute({ type: 'set', level: 0 });
    const before = f.storage.getItem(WINDOW_ZOOM_KEY);
    f.owner.visibilityChanged('visible');
    expect(f.rendered.at(-1)).toBe(0);
    expect(f.storage.getItem(WINDOW_ZOOM_KEY)).toBe(before);
    expect(f.owner.getSnapshot()).toMatchObject({ appliedLevel: 0, visibility: 'visible' });
  });
  it('distinguishes persisted state from a failed presenter', () => {
    const f = fixture();
    const owner = new WindowZoom(f.storage, (level) => {
      if (level !== 0) throw Error('presenter failed');
    });
    expect(() => owner.execute({ type: 'set', level: 1 })).toThrow('zoom-apply-failed');
    expect(owner.getSnapshot()).toMatchObject({
      appliedLevel: null,
      document: { primaryLevel: 1 },
    });
    expect(parseZoomDocument(f.storage.getItem(WINDOW_ZOOM_KEY)).primaryLevel).toBe(1);
  });
  it.each([
    { type: 'set', level: 1.2 },
    { type: 'set', level: 9 },
    { type: 'reset', level: 0 },
    { type: 'step', delta: 2 },
  ])('rejects malformed operation %j', (input) => {
    expect(() => parseZoomOperation(input)).toThrow('zoom-invalid-operation');
  });
});
