import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import type { GenuiPreviewDiagnostic } from './genui-preview.js';

export const GENUI_DIAGRAM_LIMITS = Object.freeze({
  sourceBytes: 8_192,
  svgBytes: 49_152,
  maxEdges: 128,
  deadlineMs: 3_000,
  oldHeapMb: 64,
  youngHeapMb: 16,
  maxHeight: 20_000,
});
export const GENUI_DIAGRAM_COMPILER = 'pele@1.13.0';

export class GenuiDiagramError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GenuiDiagramError';
  }
}

export interface GenuiDiagramResult {
  compiler: typeof GENUI_DIAGRAM_COMPILER;
  sourceSha256: string;
  svgSha256: string;
  svg: string;
  bytes: number;
  width: number;
  height: number;
  family: 'flowchart' | 'sequence' | 'xychart';
}

let active = false;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export async function compileGenuiDiagram(
  source: string,
  width = 728,
  options: {
    signal?: AbortSignal;
    onDiagnostic?: ((event: GenuiPreviewDiagnostic) => void) | undefined;
    spawn?: (() => Worker) | undefined;
    deadlineMs?: number;
  } = {},
): Promise<GenuiDiagramResult> {
  const started = performance.now();
  const report = (phase: GenuiPreviewDiagnostic['phase'], reason?: string) =>
    options.onDiagnostic?.({
      phase,
      durationMs: Math.round(performance.now() - started),
      ...(reason === undefined ? {} : { reason }),
    });
  options.signal?.throwIfAborted();
  if (
    typeof source !== 'string' ||
    !source.trim() ||
    Buffer.byteLength(source) > GENUI_DIAGRAM_LIMITS.sourceBytes ||
    !Number.isInteger(width) ||
    width < 240 ||
    width > 1600
  ) {
    report('refused', 'genui-diagram-input');
    throw new GenuiDiagramError(
      'genui-diagram-input',
      'Use nonempty Mermaid up to 8 KiB and an integer width from 240 to 1600.',
    );
  }
  if (active) {
    report('refused', 'genui-diagram-busy');
    throw new GenuiDiagramError(
      'genui-diagram-busy',
      'Another diagram is compiling. Retry after it finishes.',
    );
  }
  active = true;
  let worker: Worker | undefined;
  let dispose = () => {};
  try {
    report('starting');
    const sourceSha256 = sha256(source);
    const entry = new URL(
      import.meta.url.endsWith('.ts') ? './genui-diagram-worker.ts' : './genui-diagram-worker.mjs',
      import.meta.url,
    );
    worker =
      options.spawn?.() ??
      new Worker(entry, {
        workerData: {
          source,
          width,
          idPrefix: `genui-${sha256(`${width}:${source}`).slice(0, 24)}`,
          sourceLimit: GENUI_DIAGRAM_LIMITS.sourceBytes,
          outputLimit: GENUI_DIAGRAM_LIMITS.svgBytes,
          maxEdges: GENUI_DIAGRAM_LIMITS.maxEdges,
        },
        execArgv: [],
        resourceLimits: {
          maxOldGenerationSizeMb: GENUI_DIAGRAM_LIMITS.oldHeapMb,
          maxYoungGenerationSizeMb: GENUI_DIAGRAM_LIMITS.youngHeapMb,
        },
      });
    const running = worker;
    const reply: unknown = await new Promise((resolve, reject) => {
      const message = (value: unknown) => resolve(value);
      const error = () =>
        reject(
          new GenuiDiagramError(
            'genui-diagram-worker',
            'Diagram compiler stopped. Simplify the diagram and retry.',
          ),
        );
      const exit = () => error();
      const abort = () => reject(options.signal?.reason ?? new Error('Diagram cancelled.'));
      const timer = setTimeout(
        () =>
          reject(
            new GenuiDiagramError(
              'genui-diagram-timeout',
              'Diagram compilation exceeded its time budget.',
            ),
          ),
        options.deadlineMs ?? GENUI_DIAGRAM_LIMITS.deadlineMs,
      );
      running.once('message', message);
      running.once('error', error);
      running.once('exit', exit);
      options.signal?.addEventListener('abort', abort, { once: true });
      dispose = () => {
        clearTimeout(timer);
        running.off('message', message);
        running.off('error', error);
        running.off('exit', exit);
        options.signal?.removeEventListener('abort', abort);
      };
      if (options.signal?.aborted) abort();
    });
    options.signal?.throwIfAborted();
    if (
      typeof reply !== 'object' ||
      reply === null ||
      !('ok' in reply) ||
      reply.ok !== true ||
      !('svg' in reply) ||
      typeof reply.svg !== 'string' ||
      !('family' in reply) ||
      !['flowchart', 'sequence', 'xychart'].includes(String(reply.family)) ||
      !('width' in reply) ||
      typeof reply.width !== 'number' ||
      !Number.isFinite(reply.width) ||
      reply.width <= 0 ||
      !('height' in reply) ||
      typeof reply.height !== 'number' ||
      !Number.isFinite(reply.height) ||
      reply.height <= 0 ||
      reply.height > GENUI_DIAGRAM_LIMITS.maxHeight
    )
      throw new GenuiDiagramError(
        'genui-diagram-invalid',
        'Unsupported or invalid diagram, or render budget exceeded. Use flowchart, sequenceDiagram or xychart-beta.',
      );
    const bytes = Buffer.byteLength(reply.svg);
    if (bytes > GENUI_DIAGRAM_LIMITS.svgBytes)
      throw new GenuiDiagramError(
        'genui-diagram-output',
        'Diagram SVG exceeds its 48 KiB UTF-8 budget.',
      );
    const family = reply.family;
    if (family !== 'flowchart' && family !== 'sequence' && family !== 'xychart')
      throw new GenuiDiagramError('genui-diagram-invalid', 'Unsupported diagram family.');
    report('completed');
    return {
      compiler: GENUI_DIAGRAM_COMPILER,
      sourceSha256,
      svgSha256: sha256(reply.svg),
      svg: reply.svg,
      bytes,
      width: reply.width,
      height: reply.height,
      family,
    };
  } catch (error) {
    const failure =
      options.signal?.aborted || error instanceof GenuiDiagramError
        ? error
        : new GenuiDiagramError(
            'genui-diagram-worker',
            'Diagram compiler could not start or stopped unexpectedly.',
          );
    report(
      'refused',
      failure instanceof GenuiDiagramError ? failure.code : 'genui-diagram-cancelled',
    );
    throw failure;
  } finally {
    try {
      await worker?.terminate();
    } finally {
      dispose();
      active = false;
      report('stopped');
    }
  }
}
