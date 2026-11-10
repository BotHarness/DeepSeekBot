import type { GenuiDocumentRuntime } from '../../../core/src/channels/genui-document-runtime.js';

declare const require: { async(spec: string): Promise<GenuiDocumentRuntime> };

export function createGenuiRuntimeLoader(
  request: () => Promise<GenuiDocumentRuntime>,
): () => Promise<GenuiDocumentRuntime> {
  let pending: Promise<GenuiDocumentRuntime> | undefined;
  return () => {
    if (pending) return pending;
    let started: Promise<GenuiDocumentRuntime>;
    try {
      started = Promise.resolve(request());
    } catch (error) {
      started = Promise.reject(error);
    }
    const loading = started.catch((error: unknown) => {
      if (pending === loading) pending = undefined;
      throw error;
    });
    loading.catch(() => {});
    pending = loading;
    return loading;
  };
}

export const loadGenuiDocumentRuntime = createGenuiRuntimeLoader(() =>
  require.async('./client.genui.js'),
);
