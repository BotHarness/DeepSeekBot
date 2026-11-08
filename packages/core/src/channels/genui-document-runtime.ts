import { GenuiDocumentSurface } from './genui-document-surface.js';

declare const __GENUI_WORKER_SOURCE__: string;

export type GenuiDocumentHandle = Pick<
  GenuiDocumentSurface,
  'ready' | 'restore' | 'theme' | 'textScale' | 'dispose'
>;
export type GenuiDocumentMountOptions = Omit<
  ConstructorParameters<typeof GenuiDocumentSurface>[1],
  'workerSource'
>;

export function mountGenuiDocument(
  container: HTMLElement,
  options: GenuiDocumentMountOptions,
): GenuiDocumentHandle {
  return new GenuiDocumentSurface(container, {
    ...options,
    workerSource: __GENUI_WORKER_SOURCE__,
  });
}

export type GenuiDocumentRuntime = { mountGenuiDocument: typeof mountGenuiDocument };
