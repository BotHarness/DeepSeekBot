export type RendererInput =
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array }
  | { readonly kind: 'stream'; readonly stream: ReadableStream<Uint8Array> };

export interface RendererDisplayOptions {
  readonly theme: 'light' | 'dark';
  readonly fontScale: number;
}

export type RendererState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'failure'; readonly reason: string };

export interface RendererProps {
  readonly input: RendererInput;
  readonly display: RendererDisplayOptions;
  readonly onState: (state: RendererState) => void;
}

export interface Renderer<View> {
  readonly match: (mediaType: string, name: string) => boolean;
  readonly maxBytes: number;
  readonly component: (props: RendererProps) => View;
}

export type PreviewFallbackReason = 'unsupported' | 'over-limit' | 'renderer-failed';

export interface PreviewFallback {
  readonly kind: 'fallback';
  readonly reason: PreviewFallbackReason;
  readonly actions: readonly ['open-external', 'download'];
}

export function previewFallback(reason: PreviewFallbackReason): PreviewFallback {
  return { kind: 'fallback', reason, actions: ['open-external', 'download'] };
}

export function createRendererRegistry<View>(renderers: readonly Renderer<View>[]) {
  const registered = [...renderers];
  const match = (mediaType: string, name: string) =>
    registered.find((renderer) => renderer.match(mediaType, name));

  return {
    match,
    resolve(file: {
      mediaType: string;
      name: string;
      size: number;
    }): { kind: 'render'; renderer: Renderer<View> } | PreviewFallback {
      const renderer = match(file.mediaType, file.name);
      if (renderer === undefined) return previewFallback('unsupported');
      if (file.size > renderer.maxBytes) return previewFallback('over-limit');
      return { kind: 'render', renderer };
    },
  };
}

export const MARKDOWN_MAX_BYTES = 512 * 1024;

export function decodeMarkdownBytes(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  for (const [control] of text.matchAll(/\p{Cc}/gu))
    if (control !== '\t' && control !== '\n' && control !== '\r')
      throw new TypeError('Markdown contains non-text bytes');
  return text;
}

export function markdownRenderer<View>(component: Renderer<View>['component']): Renderer<View> {
  return {
    match(mediaType, name) {
      const mime = mediaType.split(';', 1)[0]?.trim().toLowerCase();
      return (
        mime === 'text/markdown' ||
        mime === 'text/x-markdown' ||
        ((mime === 'text/plain' || mime === 'application/octet-stream') &&
          /\.(?:md|markdown|mdown|mkd)$/iu.test(name))
      );
    },
    maxBytes: MARKDOWN_MAX_BYTES,
    component,
  };
}
