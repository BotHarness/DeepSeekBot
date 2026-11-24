import { compileGenuiDiagram, GenuiDiagramError } from './genui-diagram.js';
import type { GenuiPreviewDiagnostic } from './genui-preview.js';

export const GENUI_AUTHORING_LIMITS = Object.freeze({
  diagrams: 8,
  previews: 64,
  previewTtlMs: 2 * 60 * 60 * 1000,
});

const DIAGRAM = /<genui-diagram\b([^>]*)>([\s\S]*?)<\/genui-diagram\s*>/giu;
const ELEMENT = /^<genui-diagram\b([^>]*)>([\s\S]*?)<\/genui-diagram\s*>$/iu;
const OPEN_DIAGRAM = /<genui-diagram\b/iu;
const WIDTH = /^\s*(?:width\s*=\s*(?:"(\d{1,4})"|'(\d{1,4})'|(\d{1,4})))?\s*$/iu;
const ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&amp;': '&',
};

export class GenuiAuthoringError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GenuiAuthoringError';
  }
}

function decode(source: string): string {
  return source.replace(/&(?:lt|gt|quot|#39|amp);/gu, (entity) => ENTITIES[entity] ?? entity);
}

const INERT =
  /<!--[\s\S]*?(?:-->|$)|<(script|style|textarea|title)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/giu;

function blank(html: string): string {
  return html.replace(INERT, (region) => ' '.repeat(region.length));
}

export async function expandGenuiDiagrams(
  html: string,
  options: {
    signal?: AbortSignal;
    onDiagnostic?: ((event: GenuiPreviewDiagnostic) => void) | undefined;
  } = {},
): Promise<string> {
  if (!OPEN_DIAGRAM.test(html)) return html;
  const markup = blank(html);
  const matches = [...markup.matchAll(DIAGRAM)].map((found) => {
    const match = ELEMENT.exec(html.slice(found.index, found.index + found[0].length))!;
    return Object.assign(match, { index: found.index });
  });
  const unmatched = (markup.match(/<genui-diagram\b/giu) ?? []).length;
  if (unmatched !== matches.length)
    throw new GenuiAuthoringError(
      'genui-diagram-tag',
      'Close every <genui-diagram> with </genui-diagram> and do not nest them.',
    );
  if (matches.length > GENUI_AUTHORING_LIMITS.diagrams)
    throw new GenuiAuthoringError(
      'genui-diagram-tag',
      `Use at most ${GENUI_AUTHORING_LIMITS.diagrams} <genui-diagram> elements per document.`,
    );
  let output = '';
  let cursor = 0;
  for (const match of matches) {
    const width = WIDTH.exec(match[1] ?? '');
    if (width === null)
      throw new GenuiAuthoringError(
        'genui-diagram-tag',
        '<genui-diagram> accepts only an optional width="240–1600" attribute.',
      );
    const value = width[1] ?? width[2] ?? width[3];
    let compiled;
    try {
      compiled = await compileGenuiDiagram(
        decode(match[2] ?? '').trim(),
        value === undefined ? undefined : Number(value),
        {
          ...(options.signal === undefined ? {} : { signal: options.signal }),
          onDiagnostic: options.onDiagnostic,
        },
      );
    } catch (error) {
      if (error instanceof GenuiDiagramError)
        throw new GenuiDiagramError(
          error.code,
          `Diagram ${matches.indexOf(match) + 1}: ${error.message}`,
        );
      throw error;
    }
    output += html.slice(cursor, match.index) + compiled.svg;
    cursor = match.index + match[0].length;
  }
  return output + html.slice(cursor);
}

export async function expandGenuiContent(
  value: unknown,
  options: Parameters<typeof expandGenuiDiagrams>[1] = {},
): Promise<unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    value.version !== 2 ||
    !('html' in value) ||
    typeof value.html !== 'string'
  )
    return value;
  return { ...value, html: await expandGenuiDiagrams(value.html, options) };
}

interface StoredPreview {
  document: unknown;
  expiresAt: number;
}

export interface GenuiPreviewStore {
  remember(scope: string, previewId: string, document: unknown): void;
  read(scope: string, previewId: string): unknown;
}

export function createGenuiPreviewStore(
  now: () => number = Date.now,
  limits: { entries: number; ttlMs: number } = {
    entries: GENUI_AUTHORING_LIMITS.previews,
    ttlMs: GENUI_AUTHORING_LIMITS.previewTtlMs,
  },
): GenuiPreviewStore {
  const entries = new Map<string, StoredPreview>();
  const key = (scope: string, previewId: string) => `${scope}\u0000${previewId}`;
  const prune = () => {
    const current = now();
    for (const [entry, stored] of entries) if (stored.expiresAt <= current) entries.delete(entry);
    while (entries.size > limits.entries) entries.delete(entries.keys().next().value!);
  };
  return {
    remember(scope, previewId, document) {
      const entry = key(scope, previewId);
      entries.delete(entry);
      entries.set(entry, {
        document: structuredClone(document),
        expiresAt: now() + limits.ttlMs,
      });
      prune();
    },
    read(scope, previewId) {
      prune();
      const stored = entries.get(key(scope, previewId));
      if (stored === undefined)
        throw new GenuiAuthoringError(
          'genui-preview-expired',
          'That genui_preview_id is unknown or expired for this Bot. Preview the document again, or send the complete genui_json.',
        );
      return structuredClone(stored.document);
    },
  };
}

export const genuiPreviews = createGenuiPreviewStore();
