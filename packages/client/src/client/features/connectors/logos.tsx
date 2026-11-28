import { useCallback, useSyncExternalStore, type ReactElement } from 'react';

import { BrandLogo } from '../../ds/brand-logo.js';
import { connectorLogo } from '../../ds/brand-logos.js';

export type FetchLogos = (services: string[]) => Promise<{ logos: Record<string, string> }>;

const BATCH = 60;
const known = new Map<string, string | null>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
const queues = new Map<FetchLogos, Set<string>>();

function notify(): void {
  for (const listener of listeners) listener();
}

function flush(fetchLogos: FetchLogos): void {
  const queue = queues.get(fetchLogos);
  queues.delete(fetchLogos);
  if (queue === undefined) return;
  const services = [...queue];
  for (let start = 0; start < services.length; start += BATCH) {
    const batch = services.slice(start, start + BATCH);
    fetchLogos(batch).then(
      ({ logos }) => {
        for (const service of batch) {
          pending.delete(service);
          known.set(service, logos[service] ?? null);
        }
        notify();
      },
      () => {
        for (const service of batch) pending.delete(service);
      },
    );
  }
}

function request(service: string, fetchLogos: FetchLogos): void {
  if (connectorLogo(service) !== undefined || known.has(service) || pending.has(service)) return;
  pending.add(service);
  const queue = queues.get(fetchLogos);
  if (queue !== undefined) {
    queue.add(service);
    return;
  }
  queues.set(fetchLogos, new Set([service]));
  setTimeout(() => flush(fetchLogos), 0);
}

export function useConnectorLogo(
  service: string,
  fetchLogos: FetchLogos | undefined,
): string | undefined {
  const subscribe = useCallback(
    (listener: () => void) => {
      listeners.add(listener);
      if (fetchLogos !== undefined) request(service, fetchLogos);
      return () => {
        listeners.delete(listener);
      };
    },
    [service, fetchLogos],
  );
  const read = () => connectorLogo(service) ?? known.get(service) ?? undefined;
  return useSyncExternalStore(subscribe, read, read);
}

const ALIASES: Readonly<Record<string, string>> = { google_workspace: 'gmail' };

export function ConnectorLogo({
  service,
  size,
  logos,
}: {
  service: string;
  size?: number;
  logos: FetchLogos | undefined;
}): ReactElement {
  const src = useConnectorLogo(ALIASES[service] ?? service, logos);
  return <BrandLogo src={src} {...(size === undefined ? {} : { size })} />;
}
