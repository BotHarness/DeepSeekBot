import { getThisHost } from './this-host.js';
import { hostLooks } from './host-looks.js';
import { controlHostLook } from './host-look-control.js';
import { resetAppearance } from './appearance-recovery.js';
import { WallpaperError } from './wallpaper-store.js';
import type { Wallpaper } from './wallpaper.js';
import { createWallpaperControl } from './wallpaper-control.js';
import { Appearance, AppearanceError, object } from './appearance.js';
import { remoteHosts } from './remote-hosts.js';

export function mountAppearanceControl(owner: Appearance, wallpaper?: Wallpaper): () => void {
  const abort = new AbortController();
  const media = wallpaper ? createWallpaperControl(wallpaper) : undefined;
  let registration: { clientId: string; token: string } | undefined;
  const post = async (body: Record<string, unknown>) => {
    const response = await fetch('./api/botharness/appearance-control', {
      method: 'POST',
      credentials: 'same-origin',
      signal: abort.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = object(await response.json());
    if (!response.ok) throw new AppearanceError(String(object(result.error).code));
    return result;
  };
  const run = async () => {
    while (!abort.signal.aborted) {
      try {
        const value = await post({
          action: 'register',
          platform: location.protocol === 'dsh-app:' ? 'desktop' : 'web',
        });
        if (typeof value.clientId !== 'string' || typeof value.token !== 'string')
          throw new Error('Invalid Client registration');
        registration = { clientId: value.clientId, token: value.token };
        while (!abort.signal.aborted) {
          const { command: raw } = await post({ action: 'poll', ...registration });
          if (raw === null) continue;
          const command = object(raw);
          let result: unknown;
          try {
            if (typeof command.expiresAt !== 'number' || Date.now() > command.expiresAt)
              throw new AppearanceError('appearance-request-stale');
            if (command.hostLook !== undefined) {
              const looks = hostLooks();
              await looks.ready;
              result = await controlHostLook(looks, command.hostLook, command.expectedRevision, {
                expiresAt: command.expiresAt,
                signal: abort.signal,
              }, (hostId) => hostId === getThisHost().id || remoteHosts().getSnapshot().hosts.some((entry) => entry.host.hostId === hostId));
            } else if (command.notifications !== undefined) {
              const sources = remoteHosts();
              const input = object(command.notifications);
              if (
                typeof input.hostId !== 'string' ||
                !sources.getSnapshot().hosts.some((entry) => entry.host.hostId === input.hostId)
              )
                throw new AppearanceError('notification-host-unknown');
              try {
                result = await sources.notifications.control(input, command.expectedRevision, {
                  expiresAt: command.expiresAt,
                  signal: abort.signal,
                });
              } catch (error) {
                throw new AppearanceError(
                  error instanceof Error ? error.message : 'notification-client-failed',
                );
              }
            } else if (command.recovery !== undefined) {
              if (!wallpaper) throw new WallpaperError('wallpaper-unavailable');
              result = await resetAppearance(
                owner,
                wallpaper,
                command.recovery,
                command.expectedRevision,
                command.expiresAt,
              );
            } else if (command.wallpaper !== undefined) {
              if (!media) throw new WallpaperError('wallpaper-unavailable');
              result = await media.execute(
                command.wallpaper,
                command.expectedRevision,
                command.expiresAt,
              );
            } else {
              owner.refresh();
              if (owner.getSnapshot().error) throw new AppearanceError(owner.getSnapshot().error!);
              if (command.patch !== undefined && typeof command.expectedRevision !== 'string')
                throw new AppearanceError('appearance-revision-required');
              result = {
                targets: owner.targets(),
                snapshot:
                  command.patch === undefined
                    ? owner.getSnapshot()
                    : owner.update(command.patch, command.expectedRevision as string),
              };
            }
          } catch (error) {
            result = {
              error: {
                code:
                  error instanceof AppearanceError || error instanceof WallpaperError
                    ? error.code
                    : 'appearance-client-failed',
              },
            };
          }
          if (abort.signal.aborted) return;
          if (
            (command.notifications !== undefined || command.hostLook !== undefined) &&
            typeof command.expiresAt === 'number' &&
            Date.now() >= command.expiresAt
          )
            continue;
          await post({ action: 'reply', ...registration, requestId: command.id, result });
        }
      } catch {
        if (!abort.signal.aborted)
          await new Promise<void>((resolve) => {
            const done = () => {
              clearTimeout(timer);
              abort.signal.removeEventListener('abort', done);
              resolve();
            };
            const timer = setTimeout(done, 3000);
            abort.signal.addEventListener('abort', done, { once: true });
          });
      }
    }
  };
  void run();
  return () => {
    abort.abort();
    media?.dispose();
    if (registration)
      void fetch('./api/botharness/appearance-control', {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'unregister', ...registration }),
      }).catch(() => {});
  };
}
