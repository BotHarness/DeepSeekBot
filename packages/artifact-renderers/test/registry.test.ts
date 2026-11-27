import { describe, expect, it } from 'vitest';
import {
  createRendererRegistry,
  markdownRenderer,
  MARKDOWN_MAX_BYTES,
  previewFallback,
  type RendererState,
} from '../src/index';

describe('Renderer registry', () => {
  const descriptor = markdownRenderer(({ input, display, onState }) => {
    onState({ kind: 'loading' });
    if (input.kind === 'stream') return input.stream;
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(input.bytes);
      onState({ kind: 'ready' });
      return { text, ...display };
    } catch {
      onState({ kind: 'failure', reason: 'invalid UTF-8' });
      return null;
    }
  });
  const registry = createRendererRegistry([descriptor]);

  it.each([
    ['text/markdown', 'report'],
    ['text/X-Markdown; charset=utf-8', 'report'],
    ['text/plain', 'REPORT.MD'],
    ['text/plain; charset=utf-8', '报告.markdown'],
  ])('selects Markdown for %s and %s', (mediaType, name) => {
    expect(registry.match(mediaType, name)).toBe(descriptor);
  });

  it('selects external open and download for unsupported or oversized previews', () => {
    const file = { mediaType: 'text/plain', name: 'notes.md', size: MARKDOWN_MAX_BYTES };
    expect(registry.resolve(file)).toEqual({ kind: 'render', renderer: descriptor });
    expect(registry.resolve({ ...file, size: file.size + 1 })).toEqual({
      kind: 'fallback',
      reason: 'over-limit',
      actions: ['open-external', 'download'],
    });
    for (const unsupported of [
      { ...file, name: 'notes.txt' },
      { ...file, mediaType: 'text/html' },
      { ...file, mediaType: 'application/octet-stream' },
    ])
      expect(registry.resolve(unsupported)).toEqual({
        kind: 'fallback',
        reason: 'unsupported',
        actions: ['open-external', 'download'],
      });
  });

  it('passes bytes, theme and font scale to the selected component and receives its ready state', () => {
    const states: RendererState[] = [];
    const input = { kind: 'bytes', bytes: new TextEncoder().encode('# 报告') } as const;
    const view = registry.match('text/markdown', 'report.md')?.component({
      input,
      display: { theme: 'dark', fontScale: 1.5 },
      onState: (state) => states.push(state),
    });
    expect(states).toEqual([{ kind: 'loading' }, { kind: 'ready' }]);
    expect(view).toEqual({ text: '# 报告', theme: 'dark', fontScale: 1.5 });
  });

  it('accepts a stream, and preserves fallback choices when a component reports failure', () => {
    const stream = new ReadableStream<Uint8Array>();
    const states: RendererState[] = [];
    const display = { theme: 'light', fontScale: 1 } as const;
    expect(
      descriptor.component({
        input: { kind: 'stream', stream },
        display,
        onState: () => undefined,
      }),
    ).toBe(stream);
    expect(
      descriptor.component({
        input: { kind: 'bytes', bytes: Uint8Array.of(0xff) },
        display,
        onState: (state) => states.push(state),
      }),
    ).toBeNull();
    expect(states.at(-1)).toEqual({ kind: 'failure', reason: 'invalid UTF-8' });
    expect(previewFallback('renderer-failed').actions).toEqual(['open-external', 'download']);
  });
});
