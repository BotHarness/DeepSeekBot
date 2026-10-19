import type {
  Shortcuts,
  ShortcutCommand,
  ShortcutCommandId,
} from '@deepseek-ai/dsh-client-shortcuts/client';
import type { BotHarnessTranslate } from './locale.js';
import { WindowZoom, type ZoomStorage, WINDOW_ZOOM_KEY } from './window-zoom.js';
import { mountZoomTooltips } from './window-zoom-tooltips.js';

export interface ZoomCompatibility {
  version: 1;
  desktopVersion: '0.2.1-rc.2';
  acquire(): Promise<() => void>;
}
export interface ZoomSurface {
  getSnapshot(): WindowZoom | null;
  getErrorSnapshot(): string | null;
  subscribe(listener: () => void): () => void;
}
export function mountWindowZoom(options: {
  document: Document | undefined;
  window:
    | (Pick<Window, 'addEventListener' | 'removeEventListener'> & {
        location: Pick<Location, 'protocol' | 'hostname'>;
      })
    | undefined;
  shortcuts: Pick<Shortcuts, 'runtime' | 'platform' | 'register'>;
  storage: ZoomStorage | undefined;
  compatibility: ZoomCompatibility | undefined;
  t: BotHarnessTranslate;
  onReady?: (owner: WindowZoom) => () => void;
}): { surface: ZoomSurface; dispose(): Promise<void> } {
  const { document: doc, window: win, shortcuts, compatibility, t } = options;
  let owner: WindowZoom | null = null;
  let initializationError: string | null = null;
  const listeners = new Set<() => void>();
  const surface: ZoomSurface = {
    getSnapshot: () => owner,
    getErrorSnapshot: () => initializationError,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  let disposed = false;
  const disposers: (() => void)[] = [];
  const root = doc?.documentElement;
  const oldZoom = root?.style.zoom;
  const oldLayoutZoom = root?.style.getPropertyValue('--bh-window-zoom');
  const oldLayoutPriority = root?.style.getPropertyPriority('--bh-window-zoom');
  const ready = (async () => {
    if (
      !doc ||
      !win ||
      !root ||
      win.location.protocol !== 'dsh-app:' ||
      win.location.hostname !== 'app' ||
      shortcuts.runtime !== 'desktop' ||
      shortcuts.platform !== 'macos' ||
      compatibility?.version !== 1 ||
      compatibility.desktopVersion !== '0.2.1-rc.2'
    )
      return;
    const release = await compatibility.acquire();
    if (disposed) {
      release();
      return;
    }

    disposers.push(release);
    try {
      const instance = new WindowZoom(options.storage, (level) => {
        root.style.zoom = String(1.2 ** level);
        root.style.setProperty('--bh-window-zoom', String(1.2 ** level));
      });
      disposers.push(mountZoomTooltips(doc));
      disposers.push(() => {
        root.style.zoom = oldZoom ?? '';
        if (oldLayoutZoom)
          root.style.setProperty('--bh-window-zoom', oldLayoutZoom, oldLayoutPriority);
        else root.style.removeProperty('--bh-window-zoom');
      });
      const definitions = [
        ['increase', 'Equal', false, 1],
        ['increaseShift', 'Equal', true, 1],
        ['decrease', 'Minus', false, -1],
        ['reset', 'Digit0', false, 0],
      ] as const;
      for (const [name, code, shift, delta] of definitions) {
        const command: ShortcutCommand = {
          id: `botharness.zoom.${name}` as ShortcutCommandId,
          label: () =>
            t(delta === 1 ? 'zoom.increase' : delta === -1 ? 'zoom.decrease' : 'zoom.reset'),
          aliases: ['window', 'zoom'],
          defaults: {
            'desktop:macos': { code, modifiers: shift ? ['primary', 'shift'] : ['primary'] },
          },
          regions: ['page', 'editable', 'terminal'],
          modals: ['other'],
          resolve: () => ({
            status: 'handled',
            run: () => {
              try {
                instance.execute(delta === 0 ? { type: 'reset' } : { type: 'step', delta });
              } catch {}
            },
          }),
        };
        disposers.push(shortcuts.register(command));
      }
      const visibility = () =>
        instance.visibilityChanged(doc.visibilityState === 'hidden' ? 'hidden' : 'visible');
      const storageChanged = (event: StorageEvent) => {
        if (event.key === WINDOW_ZOOM_KEY || event.key === null) instance.refresh();
      };
      doc.addEventListener('visibilitychange', visibility);
      win.addEventListener('storage', storageChanged);
      disposers.push(() => {
        doc.removeEventListener('visibilitychange', visibility);
        win.removeEventListener('storage', storageChanged);
      });
      visibility();
      if (options.onReady) disposers.push(options.onReady(instance));
      owner = instance;
      for (const listener of listeners) listener();
    } catch (error) {
      for (const dispose of disposers.splice(0).reverse()) dispose();
      throw error;
    }
  })();
  void ready.catch(() => {
    initializationError = 'zoom-initialization-failed';
    for (const listener of listeners) listener();
  });
  return {
    surface,
    async dispose() {
      disposed = true;
      try {
        await ready;
      } catch {
      } finally {
        for (const dispose of disposers.splice(0).reverse()) dispose();
        owner = null;
        for (const listener of listeners) listener();
        listeners.clear();
      }
    },
  };
}
