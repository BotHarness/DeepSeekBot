import { describe, expect, it, vi } from 'vitest';

import {
  REDACTION_FILL,
  annotatedName,
  boxNoteAnchor,
  canvasPoint,
  extendAnnotation,
  finishAnnotation,
  paintAnnotation,
  screenshotName,
  startAnnotation,
  textAnnotation,
  type AnnotationPainter,
} from '../src/client/bug-report-annotate.js';
import { prefersScreenShare } from '../src/client/bug-report-capture.js';

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
      font: '',
      textBaseline: 'alphabetic',
      fillText: () => calls.push('fillText'),
      measureText: (value: string) => ({ width: value.length * 10 }),
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

  it('places comments under a box, keeps them inside the image, and drops empty text', () => {
    const size = { width: 1000, height: 600 };
    expect(boxNoteAnchor({ x: 10, y: 20, w: 100, h: 50 }, size)).toEqual([10, 76]);
    expect(boxNoteAnchor({ x: 10, y: 500, w: 100, h: 95 }, size)).toEqual([10, 506]);
    expect(textAnnotation([5, 6], '   ')).toBeUndefined();
    expect(textAnnotation([5, 6], ' 这里一直转圈 ')).toEqual({
      tool: 'text',
      x: 5,
      y: 6,
      text: '这里一直转圈',
    });
    const fills: number[][] = [];
    const texts: unknown[][] = [];
    const painter = {
      save() {},
      restore() {},
      fillRect: (...args: number[]) => fills.push(args),
      fillText: (...args: unknown[]) => texts.push(args),
      measureText: (value: string) => ({ width: value.length * 10 }),
    } as unknown as AnnotationPainter;
    paintAnnotation(
      painter,
      { tool: 'text', x: 990, y: 10, text: 'abcd' },
      { stroke: 'red', width: 3, label: 20, canvasWidth: 1000 },
    );
    expect(fills[0]![0]! + fills[0]![2]!).toBe(1000);
    expect(texts[0]![0]).toBe('abcd');
  });

  it('names the outputs and detects screen capture support', () => {
    expect(annotatedName('pasted-20261110-083000.png')).toBe(
      'pasted-20261110-083000-annotated.png',
    );
    expect(annotatedName('shot-annotated.png')).toBe('shot-annotated.png');
    expect(annotatedName('photo.jpeg')).toBe('photo-annotated.png');
    expect(screenshotName(new Date(2026, 10, 10, 8, 3, 9))).toBe('screenshot-20261110-080309.png');
    const share = { mediaDevices: { getDisplayMedia: async () => new MediaStream() } };
    expect(prefersScreenShare({})).toBe(false);
    expect(prefersScreenShare({ navigator: { mediaDevices: {} } })).toBe(false);
    expect(prefersScreenShare({ navigator: share })).toBe(true);
    expect(prefersScreenShare({ navigator: share, dshDesktop: {} })).toBe(false);
  });
});

describe('attachment notes', () => {
  it('appends one line per noted attachment to the description', async () => {
    const { describeAttachments } = await import('../src/client/bug-report.js');
    const file = (name: string) => new File(['x'], name, { type: 'image/png' });
    expect(describeAttachments(' Loading forever ', [{ id: '1', file: file('a.png') }])).toBe(
      'Loading forever',
    );
    expect(
      describeAttachments('Loading forever', [
        { id: '1', file: file('a.png'), note: 'spinner here' },
        { id: '2', file: file('b.png') },
        { id: '3', file: file('c.png'), note: 'after Send' },
      ]),
    ).toBe('Loading forever\n\nAttachment notes:\n- a.png: spinner here\n- c.png: after Send');
    expect(describeAttachments('', [{ id: '1', file: file('a.png'), note: 'n' }])).toBe(
      'Attachment notes:\n- a.png: n',
    );
  });
});
