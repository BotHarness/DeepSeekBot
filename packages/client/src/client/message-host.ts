import { createContext, useContext } from 'react';
import type { HostClient } from '../../../../apps/mobile/src/host/client.js';

export interface MessageHost {
  client: HostClient;
  current(channelId: string): boolean;
}

export const MessageHostContext = createContext<MessageHost | undefined>(undefined);
export const useMessageHost = (): MessageHost | undefined => useContext(MessageHostContext);

export function fetchMessageResource(
  path: string,
  signal: AbortSignal,
  host?: MessageHost,
): Promise<Response> {
  if (host === undefined) return fetch(`.${path}`, { signal });
  const source = host.client.resource(path);
  return fetch(source.uri, {
    headers: source.headers,
    credentials: 'omit',
    redirect: 'error',
    signal,
  });
}
