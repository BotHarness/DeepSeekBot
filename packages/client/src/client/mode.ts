import type { Context as ClientContext } from '@deepseek-ai/cordis';

import type { ClientStore } from './store.js';

type LoggerLike = { warn(message: string, ...args: readonly unknown[]): void };

function loggerOf(ctx: ClientContext): LoggerLike | undefined {
  return (ctx as unknown as { logger?: LoggerLike }).logger;
}

export function isSlotPriorityConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /already has an? (registration|entry)/.test(error.message);
}

function warnShadowConflict(ctx: ClientContext, name: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  loggerOf(ctx)?.warn(
    `botharness: slot "${name}" shadow skipped (occupied, keeping first entry): ${detail}`,
    error,
  );
}

export const SHADOW_PRIMARY_PRIORITY = {
  sidebar: -2,
  'sidebar.workspaces': -101,
  main: -101,
} as const;

const SHADOW_FALLBACK_PRIORITY: Record<keyof typeof SHADOW_PRIMARY_PRIORITY, readonly number[]> = {
  sidebar: [-3, -4, -5, -6],
  'sidebar.workspaces': [-102, -103, -104, -99, -98],
  main: [-102, -103, -104, -99, -98],
};

export function registerModeShadow(
  ctx: ClientContext,
  name: 'sidebar' | 'sidebar.workspaces' | 'main',
  register: () => () => void,
  clientStore: ClientStore,
  presentation?: {
    enabled(): boolean;
    subscribe(listener: () => void): () => void;
  },
): void {
  ctx.slots.inject(name, () => {
    let dispose: (() => void) | undefined;
    const reconcile = (): void => {
      if (clientStore.getSnapshot().mode === 'bot' && (presentation?.enabled() ?? true)) {
        if (dispose === undefined) {
          try {
            dispose = register();
          } catch (error) {
            if (isSlotPriorityConflict(error)) {
              warnShadowConflict(ctx, name, error);
              dispose = undefined;
              return;
            }
            throw error;
          }
        }
      } else if (dispose !== undefined) {
        dispose();
        dispose = undefined;
      }
    };
    const unsubscribe = clientStore.subscribe(reconcile);
    const unsubscribePresentation = presentation?.subscribe(reconcile);
    reconcile();
    return () => {
      unsubscribe();
      unsubscribePresentation?.();
      dispose?.();
      dispose = undefined;
    };
  });
}

export function registerShadowEntry(
  ctx: ClientContext,
  name: keyof typeof SHADOW_PRIMARY_PRIORITY,
  registerAt: (priority: number) => () => void,
  options?: { primary?: number; fallbacks?: readonly number[] },
): () => void {
  const primary = options?.primary ?? SHADOW_PRIMARY_PRIORITY[name];
  const fallbacks = options?.fallbacks ?? SHADOW_FALLBACK_PRIORITY[name];
  const attempts = [primary, ...fallbacks];
  let lastConflict: unknown;
  for (const priority of attempts) {
    try {
      return registerAt(priority);
    } catch (error) {
      if (!isSlotPriorityConflict(error)) throw error;
      lastConflict = error;
      warnShadowConflict(ctx, name, error);
    }
  }
  loggerOf(ctx)?.warn(
    `botharness: slot "${name}" shadow unavailable (all priorities ${attempts.join(', ')} occupied, keeping first entries)`,
    lastConflict,
  );
  return () => {};
}
