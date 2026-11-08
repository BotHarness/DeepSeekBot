// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GenuiMirrorFrame, genuiMirrorHeight } from '../../core/src/channels/genui-mirror-frame.js';
import { GENUI_EXECUTION_LIMITS } from '../../core/src/channels/genui-execution-limits.js';

const frames: GenuiMirrorFrame[] = [];

afterEach(() => {
  for (const frame of frames.splice(0)) frame.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function open(textScale?: number) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const frame = new GenuiMirrorFrame(document.body, {
    title: 'Scaled synthetic document',
    theme: 'light',
    textScale: textScale ?? 1,
    onCommand: vi.fn(),
    onHeight: vi.fn(),
    onFailure: vi.fn(),
  });
  void frame.ready.catch(() => {});
  frames.push(frame);
  return frame;
}

describe('GenUI trusted mirror text scaling', () => {
  it('scales the script-disabled frame and inversely bounds its width without changing its document', () => {
    const frame = open(22 / 14);
    const source = frame.frame.srcdoc;
    expect(Number(frame.frame.style.zoom)).toBe(22 / 14);
    expect(frame.frame.style.width).toBe(`${100 / (22 / 14)}%`);
    expect(frame.frame.getAttribute('sandbox')).toBe('allow-same-origin');
    frame.textScale(1);
    expect(frame.frame.style.zoom).toBe('1');
    expect(frame.frame.style.width).toBe('100%');
    expect(frame.frame.srcdoc).toBe(source);
    frame.dispose();
    frame.textScale(2);
    expect(frame.frame.style.zoom).toBe('1');
  });

  it('bounds invalid and extreme presentation preferences', () => {
    const frame = open(Number.NaN);
    expect(frame.frame.style.zoom).toBe('1');
    frame.textScale(100);
    expect(Number(frame.frame.style.zoom)).toBe(GENUI_EXECUTION_LIMITS.mirrorMaxTextScale);
    frame.textScale(-1);
    expect(Number(frame.frame.style.zoom)).toBe(GENUI_EXECUTION_LIMITS.mirrorMinTextScale);
    frame.textScale(Number.POSITIVE_INFINITY);
    expect(frame.frame.style.zoom).toBe('1');
  });

  it('retains both the original and visible height budgets when scaling', () => {
    const height = vi.spyOn(document.body, 'scrollHeight', 'get');
    height.mockReturnValue(13_000);
    expect(genuiMirrorHeight(document)).toBe(13_000);
    expect(() => genuiMirrorHeight(document, 2)).toThrow('height budget');
    height.mockReturnValue(20_001);
    expect(() => genuiMirrorHeight(document, 0.5)).toThrow('height budget');
    height.mockReturnValue(9000);
    expect(genuiMirrorHeight(document, 2)).toBe(9000);
  });
});
