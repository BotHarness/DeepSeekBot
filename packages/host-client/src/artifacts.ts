import type { AttachmentRef, ChannelWireMessage } from '@botharness/host-protocol/wire';
import type { HostClient } from './client-contract';
import { CredentialRefused } from './client-errors';
import { attachmentPath } from './conversation-media';

const READ_TIMEOUT_MS = 30_000;

export interface ArtifactMetadata {
  readonly name: string;
  readonly mediaType: string;
  readonly size: number;
  readonly sender: ChannelWireMessage['author'];
  readonly sentAt: string;
  readonly channelId: string;
  readonly messageId: string;
}

export interface AttachmentArtifact {
  readonly metadata: ArtifactMetadata;
  readonly identity:
    | { readonly kind: 'file-id'; readonly value: string }
    | { readonly kind: 'legacy-hash'; readonly value: string };
}

export function attachmentArtifact(
  channelId: string,
  message: Pick<ChannelWireMessage, 'id' | 'author' | 'at'>,
  ref: AttachmentRef,
): AttachmentArtifact | undefined {
  const identity: AttachmentArtifact['identity'] | undefined =
    ref.fileId !== undefined
      ? { kind: 'file-id', value: ref.fileId }
      : ref.hash !== undefined
        ? { kind: 'legacy-hash', value: ref.hash }
        : undefined;
  if (!identity?.value || !channelId || !message.id) return undefined;
  return {
    identity,
    metadata: {
      name: ref.name,
      mediaType: ref.mime,
      size: ref.size,
      sender: message.author,
      sentAt: message.at,
      channelId,
      messageId: message.id,
    },
  };
}

export type ArtifactReadFailure =
  | 'missing'
  | 'expired'
  | 'unauthorized'
  | 'over-limit'
  | 'unavailable';
export type ArtifactSnapshot = { readonly metadata: ArtifactMetadata } & (
  | { readonly kind: 'idle' | 'loading' }
  | { readonly kind: 'ready'; readonly bytes: Uint8Array }
  | { readonly kind: 'failure'; readonly reason: ArtifactReadFailure }
);

interface ArtifactReadResponse {
  readonly status: number;
  readonly bytes?: Uint8Array;
  readonly mediaType?: string | undefined;
}

export type ArtifactReader = (input: {
  path: string;
  maxBytes: number;
  signal: AbortSignal;
}) => Promise<ArtifactReadResponse>;

function failureFor(status: number): ArtifactReadFailure {
  switch (status) {
    case 401:
    case 403:
      return 'unauthorized';
    case 404:
      return 'missing';
    case 410:
      return 'expired';
    case 413:
      return 'over-limit';
    default:
      return 'unavailable';
  }
}

export function createArtifactLoader(
  artifact: AttachmentArtifact,
  { read, maxBytes }: { read: ArtifactReader; maxBytes: number },
) {
  const { metadata, identity } = artifact;
  const path = attachmentPath({
    channelId: metadata.channelId,
    messageId: metadata.messageId,
    ...(identity.kind === 'file-id' ? { fileId: identity.value } : { hash: identity.value }),
    maxBytes: String(maxBytes),
  });
  const listeners = new Set<() => void>();
  let snapshot: ArtifactSnapshot = { kind: 'idle', metadata };
  let active: AbortController | undefined;

  const publish = (next: ArtifactSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const load = async (): Promise<void> => {
    if (active !== undefined) return;
    const request = new AbortController();
    active = request;
    publish({ kind: 'loading', metadata });
    let result: ArtifactSnapshot;
    try {
      const response = await read({ path, maxBytes, signal: request.signal });
      const bytes = response.bytes;
      if (response.status !== 200 || bytes === undefined) {
        result = { kind: 'failure', reason: failureFor(response.status), metadata };
      } else if (bytes.byteLength > maxBytes) {
        result = { kind: 'failure', reason: 'over-limit', metadata };
      } else {
        result = {
          kind: 'ready',
          metadata: {
            ...metadata,
            size: bytes.byteLength,
            mediaType: response.mediaType ?? 'application/octet-stream',
          },
          bytes,
        };
      }
    } catch (error) {
      result = {
        kind: 'failure',
        reason: error instanceof CredentialRefused ? 'unauthorized' : 'unavailable',
        metadata,
      };
    }
    if (active !== request) return;
    active = undefined;
    publish(result);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
    retry: load,
    close() {
      const request = active;
      active = undefined;
      request?.abort();
      publish({ kind: 'idle', metadata });
    },
  };
}

export function hostArtifactReader(host: Pick<HostClient, 'api'>): ArtifactReader {
  return async ({ path, signal }) => {
    const answer = await host.api(path, { response: 'file', signal, timeoutMs: READ_TIMEOUT_MS });
    return answer.body instanceof Uint8Array
      ? { status: answer.status, bytes: answer.body, mediaType: answer.contentType }
      : { status: answer.status };
  };
}

export const sameOriginArtifactReader: ArtifactReader = async ({ path, maxBytes, signal }) => {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, READ_TIMEOUT_MS);
  try {
    if (signal.aborted) cancel();
    const response = await fetch(`.${path}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
      signal: controller.signal,
    });
    if (response.status !== 200) return { status: response.status };
    if (Number(response.headers.get('content-length')) > maxBytes) return { status: 413 };
    if (response.body === null) return { status: 502 };

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > maxBytes) return { status: 413 };
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      status: 200,
      bytes,
      mediaType: response.headers.get('content-type') ?? undefined,
    };
  } finally {
    cancel();
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
};
