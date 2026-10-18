import { describe, expect, it } from 'vitest';
import { scrollChromeStep, type ScrollChromeState } from '../src/ui/shell/scroll-chrome-model';

const shown: ScrollChromeState = { offset: 0, travel: 0, hidden: false };
describe('scroll chrome intent', () => {
  it('hides after deliberate downward travel and reveals after upward travel', () => {
    const hidden = scrollChromeStep(shown, 80, 500);
    expect(hidden.hidden).toBe(true);
    expect(scrollChromeStep(hidden, 60, 500).hidden).toBe(false);
  });
  it('accumulates small movements without flickering on a tiny reversal', () => {
    let state = scrollChromeStep(shown, 8, 500);
    expect(state.hidden).toBe(false);
    state = scrollChromeStep(state, 16, 500);
    expect(state.hidden).toBe(true);
    state = scrollChromeStep(state, 13, 500);
    expect(state.hidden).toBe(true);
    expect(scrollChromeStep(state, 3, 500).hidden).toBe(false);
  });
  it('ignores elastic bottom bounce rather than revealing chrome on the bounce back', () => {
    let state = scrollChromeStep(shown, 500, 500);
    state = scrollChromeStep(state, 550, 500);
    expect(scrollChromeStep(state, 500, 500).hidden).toBe(true);
  });
  it('reveals at the top including pull to refresh and after content becomes short', () => {
    const hidden = scrollChromeStep(shown, 80, 500);
    expect(scrollChromeStep(hidden, -30, 500).hidden).toBe(false);
    expect(scrollChromeStep(hidden, 80, -100).hidden).toBe(false);
  });
});
