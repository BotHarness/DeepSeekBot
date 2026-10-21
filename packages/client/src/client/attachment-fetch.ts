export type AttachmentFetch = (path: string, init: { signal: AbortSignal }) => Promise<Response>;

export const localAttachmentFetch: AttachmentFetch = (path, init) => fetch('.' + path, init);

export function bridgeAttachmentPath(params: Record<string, string>): string {
  return '/api/botharness/attachment?' + new URLSearchParams(params);
}
