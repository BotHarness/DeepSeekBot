import { createContext, useContext } from 'react';
import type { HostClient } from '../../../../apps/mobile/src/host/client.js';
import type { PurgedPlacement } from '../../../core/src/purge/contracts.js';

export interface MessageHost {
  hostId?: string;
  client: HostClient;
  current(channelId: string): boolean;
  subscribePurges?(listener: (placements: readonly PurgedPlacement[]) => void): () => void;
}

export const MessageHostContext = createContext<MessageHost | undefined>(undefined);
export const useMessageHost = (): MessageHost | undefined => useContext(MessageHostContext);

export async function fetchMessageResource(
  path: string,
  signal: AbortSignal,
  host?: MessageHost,
): Promise<Response> {
  if (host === undefined) return fetch(`.${path}`, { signal });
  const source = host.client.resource(path);
  if (source.read) {
    const result = await source.read(signal);
    return new Response(Uint8Array.from(result.bytes), {
      headers: { 'content-type': result.mime },
    });
  }
  return fetch(source.uri, {
    headers: source.headers,
    credentials: 'omit',
    redirect: 'error',
    signal,
  });
}
