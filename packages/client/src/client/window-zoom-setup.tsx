import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import { Note } from './ds/note.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import type { ZoomSurface } from './window-zoom-mount.js';

const PATH = './api/botharness/window-zoom-setup';
type Action = 'enable' | 'disable';
export type WindowZoomSetupStatus =
  | { supported: false; code: string }
  | {
      supported: true;
      enabled: boolean;
      pending?: { action: Action; requestedAt: string };
      last?: { action: Action; status: 'done' | 'failed'; code?: string };
    };
export interface WindowZoomSetupHost {
  read(): Promise<WindowZoomSetupStatus>;
  request(action: Action | 'cancel'): Promise<WindowZoomSetupStatus>;
}

async function decode(response: Response): Promise<WindowZoomSetupStatus> {
  const value = (await response.json()) as WindowZoomSetupStatus & {
    error?: { code?: string };
  };
  if (!response.ok) throw new Error(value.error?.code ?? 'zoom-setup-unavailable');
  return value;
}
export const windowZoomSetupHost: WindowZoomSetupHost = {
  read: async () => decode(await fetch(PATH, { credentials: 'same-origin' })),
  request: async (action) =>
    decode(
      await fetch(PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      }),
    ),
};

export function WindowZoomSetup({
  surface,
  t,
  host = windowZoomSetupHost,
}: {
  surface: ZoomSurface;
  t: BotHarnessTranslate;
  host?: WindowZoomSetupHost;
}): ReactElement {
  const owner = useSyncExternalStore(surface.subscribe, surface.getSnapshot);
  const [status, setStatus] = useState<WindowZoomSetupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const mount = useMountedResource<HTMLSpanElement>(() => {
    mounted.current = true;
    host.read().then(
      (value) => mounted.current && setStatus(value),
      () => {},
    );
    return () => {
      mounted.current = false;
    };
  }, [host]);
  const probe = <span ref={mount} hidden />;
  if (!status?.supported) return probe;
  const act = (action: Action | 'cancel') => {
    setBusy(true);
    setError(null);
    host
      .request(action)
      .then(
        (value) => mounted.current && setStatus(value),
        (cause: unknown) =>
          mounted.current &&
          setError(cause instanceof Error ? cause.message : 'zoom-setup-unavailable'),
      )
      .finally(() => mounted.current && setBusy(false));
  };
  const pending = status.pending?.action;
  const action: Action = status.enabled ? 'disable' : 'enable';
  const failure = error ?? (!pending && status.last?.status === 'failed' ? status.last.code : null);
  return (
    <>
      <SettingsSection>
        <SettingsRow
          title={t(action === 'enable' ? 'zoom.setup.enable' : 'zoom.setup.disable')}
          description={
            pending
              ? t(pending === 'enable' ? 'zoom.setup.pending.enable' : 'zoom.setup.pending.disable')
              : status.enabled && !owner
                ? t('zoom.setup.reopen')
                : t(
                    action === 'enable'
                      ? 'zoom.setup.enable.description'
                      : 'zoom.setup.disable.description',
                  )
          }
          control={
            pending ? (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => act('cancel')}>
                {t('zoom.setup.cancel')}
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => act(action)}>
                {t(action === 'enable' ? 'zoom.setup.enableAction' : 'zoom.setup.disableAction')}
              </Button>
            )
          }
        >
          {failure ? <Note tone="danger">{t('zoom.setup.failed', { code: failure })}</Note> : null}
        </SettingsRow>
      </SettingsSection>
      {probe}
    </>
  );
}
