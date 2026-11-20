import { describe, expect, it } from 'vitest';
import { cancelled } from '../src/client/status-live.js';

describe('Computer status reads', () => {
  it('reports a timed-out read and stays quiet for an unmount', () => {
    const unmounted = new AbortController();
    unmounted.abort();
    const timedOut = new AbortController();
    timedOut.abort(new DOMException('The operation timed out.', 'TimeoutError'));
    expect(cancelled(unmounted.signal)).toBe(true);
    expect(cancelled(AbortSignal.any([new AbortController().signal, timedOut.signal]))).toBe(false);
    expect(cancelled(new AbortController().signal)).toBe(false);
    expect(cancelled(undefined)).toBe(false);
  });
});
