import type { GenuiDocumentRuntime } from '../../../core/src/channels/genui-document-runtime.js';

declare const require: { async(spec: string): Promise<GenuiDocumentRuntime> };

let pending: Promise<GenuiDocumentRuntime> | undefined;

export function loadGenuiDocumentRuntime(): Promise<GenuiDocumentRuntime> {
  return (pending ??= Promise.resolve()
    .then(() => require.async('./client.genui.js'))
    .catch((error: unknown) => {
      pending = undefined;
      throw error;
    }));
}
