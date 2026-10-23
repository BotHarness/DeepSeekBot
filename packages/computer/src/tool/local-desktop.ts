import { randomUUID } from 'node:crypto';
import { LocalVideoError } from '../local-video-contract.js';
import {
  ensureLocalDisplay,
  LocalDesktopCleanupError,
  type LocalDisplay,
} from './local-display.js';

export interface LocalDesktopBinding {
  readonly generation: string;
  readonly env: Readonly<Record<string, string>>;
  readonly managed: boolean;
  alive(): boolean;
}

export interface LocalDesktop {
  ensure(signal?: AbortSignal): Promise<LocalDesktopBinding>;
  current(): LocalDesktopBinding;
  close(): Promise<void>;
}

export function createLocalDesktop(options: {
  readonly env: Readonly<Record<string, string>>;
  readonly open?: ((signal?: AbortSignal) => Promise<LocalDisplay>) | undefined;
  readonly onInvalidate?: ((reason: 'stopped' | 'unavailable') => void) | undefined;
  readonly onEvent?: ((detail: string) => void) | undefined;
}): LocalDesktop {
  let display: LocalDisplay | undefined;
  let binding: LocalDesktopBinding | undefined;
  let opening: Promise<LocalDesktopBinding> | undefined;
  let closing: Promise<void> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let poisoned = false;
  const invalidate = (reason: 'stopped' | 'unavailable' = 'stopped') => {
    clearInterval(timer);
    timer = undefined;
    if (!binding) return;
    binding = undefined;
    options.onEvent?.('phase=desktop-invalidated');
    options.onInvalidate?.(reason);
  };
  const current = (): LocalDesktopBinding => {
    if (binding?.alive()) return binding;
    invalidate('unavailable');
    if (display) void close().catch(() => options.onEvent?.('phase=desktop-cleanup-unconfirmed'));
    throw new LocalVideoError('not-ready', 'The Local desktop is unavailable. Start it again.');
  };
  const close = (): Promise<void> => {
    invalidate();
    closing ??= (async () => {
      await opening?.catch(() => undefined);
      invalidate();
      const owned = display;
      display = undefined;
      try {
        await owned?.stop();
      } catch (error) {
        poisoned = true;
        options.onInvalidate?.('unavailable');
        throw error;
      }
    })().finally(() => {
      closing = undefined;
    });
    return closing;
  };
  return {
    current,
    close,
    async ensure(signal) {
      if (closing) await closing;
      if (poisoned)
        throw new LocalVideoError(
          'helper-failed',
          'Desktop cleanup was not confirmed. Restart the Host.',
        );
      if (binding?.alive()) return binding;
      opening ??= (async () => {
        invalidate('unavailable');
        try {
          await display?.stop();
        } catch (error) {
          poisoned = true;
          throw error;
        }
        display = undefined;
        signal?.throwIfAborted();
        const selected = await (options.open?.(signal) ??
          ensureLocalDisplay({
            source: options.env,
            signal,
            onEvent: options.onEvent,
            isolatedTrees: process.arch === 'x64',
          }));
        display = selected;
        const env: Record<string, string> = {
          ...options.env,
          ...selected.env,
          DISPLAY: selected.display,
        };
        if (selected.managed) {
          delete env['WAYLAND_DISPLAY'];
          env['XDG_SESSION_TYPE'] = 'x11';
        }
        const created: LocalDesktopBinding = {
          generation: randomUUID(),
          env: Object.freeze(env),
          managed: selected.managed,
          alive: () => binding === created && selected.alive(),
        };
        binding = created;
        timer = setInterval(() => {
          if (!created.alive()) {
            invalidate('unavailable');
            void close().catch(() => options.onEvent?.('phase=desktop-cleanup-unconfirmed'));
          }
        }, 200);
        timer.unref();
        options.onEvent?.(`phase=desktop-bound managed=${selected.managed}`);
        signal?.throwIfAborted();
        return created;
      })();
      try {
        return await opening;
      } catch (error) {
        if (error instanceof LocalDesktopCleanupError) {
          poisoned = true;
          options.onInvalidate?.('unavailable');
        }
        throw error;
      } finally {
        opening = undefined;
      }
    },
  };
}
