import { describe, expect, it, vi } from 'vitest';

import {
  REDACTION_FILL,
  annotatedName,
  canCaptureScreen,
  canvasPoint,
  extendAnnotation,
  finishAnnotation,
  paintAnnotation,
  screenshotName,
  startAnnotation,
  type AnnotationPainter,
} from '../src/client/bug-report-annotate.js';

describe('bug report markup', () => {
  it('normalizes a box dragged up and left, and drops a stray click', () => {
    const box = extendAnnotation(startAnnotation('box', [50, 40]), [10, 5]);
    expect(finishAnnotation(box)).toEqual({ tool: 'box', x: 10, y: 5, w: 40, h: 35 });
    expect(finishAnnotation(extendAnnotation(startAnnotation('hide', [5, 5]), [7, 30]))).toBe(
      undefined,
    );
    expect(finishAnnotation(startAnnotation('pen', [1, 1]))).toBeUndefined();
    const pen = extendAnnotation(extendAnnotation(startAnnotation('pen', [1, 1]), [2, 2]), [3, 4]);
    expect(finishAnnotation(pen)).toEqual({
      tool: 'pen',
      points: [
        [1, 1],
        [2, 2],
        [3, 4],
      ],
    });
  });

  it('maps pointer positions to image pixels and keeps them inside the image', () => {
    const rect = { left: 100, top: 50, width: 400, height: 300 };
    const size = { width: 1600, height: 1200 };
    expect(canvasPoint(rect, size, 300, 200)).toEqual([800, 600]);
    expect(canvasPoint(rect, size, 0, 900)).toEqual([0, 1200]);
  });

  it('covers hidden areas with an opaque fill and outlines boxes in the given colour', () => {
    const calls: string[] = [];
    const painter = {
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 0,
      lineJoin: 'miter',
      lineCap: 'butt',
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      strokeRect: () => calls.push('strokeRect'),
      fillRect: () => calls.push('fillRect'),
    } as AnnotationPainter;
    paintAnnotation(
      painter,
      { tool: 'hide', x: 0, y: 0, w: 10, h: 10 },
      { stroke: 'red', width: 3 },
    );
    expect(painter.fillStyle).toBe(REDACTION_FILL);
    paintAnnotation(
      painter,
      { tool: 'box', x: 0, y: 0, w: 10, h: 10 },
      { stroke: 'red', width: 3 },
    );
    expect(painter.strokeStyle).toBe('red');
    expect(calls).toEqual(['save', 'fillRect', 'restore', 'save', 'strokeRect', 'restore']);
  });

  it('names the outputs and detects screen capture support', () => {
    expect(annotatedName('pasted-20261110-083000.png')).toBe(
      'pasted-20261110-083000-annotated.png',
    );
    expect(annotatedName('shot-annotated.png')).toBe('shot-annotated.png');
    expect(annotatedName('photo.jpeg')).toBe('photo-annotated.png');
    expect(screenshotName(new Date(2026, 10, 10, 8, 3, 9))).toBe('screenshot-20261110-080309.png');
    expect(canCaptureScreen(undefined)).toBe(false);
    expect(canCaptureScreen({ mediaDevices: {} })).toBe(false);
    expect(
      canCaptureScreen({ mediaDevices: { getDisplayMedia: async () => new MediaStream() } }),
    ).toBe(true);
  });
});
