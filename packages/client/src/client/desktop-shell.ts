export interface ShellWindowState {
  readonly visible: boolean;
  readonly minimized: boolean;
  readonly focused: boolean;
}

export interface ShellWindowApi {
  state(): Promise<ShellWindowState>;
  subscribe(listener: (state: ShellWindowState) => void): () => void;
  reveal(): Promise<ShellWindowState>;
}

export interface ShellLiveActivityApi {
  acquire(reason: 'call'): Promise<string>;
  release(lease: string): Promise<void>;
}

interface ShellProductApi {
  readonly window?: Partial<ShellWindowApi>;
  readonly liveActivity?: Partial<ShellLiveActivityApi>;
}

function product(): ShellProductApi | undefined {
  const api = (globalThis as { dshDesktop?: unknown }).dshDesktop;
  return typeof api === 'object' && api !== null ? (api as ShellProductApi) : undefined;
}

export function shellWindow(): ShellWindowApi | undefined {
  const window = product()?.window;
  if (
    typeof window?.state !== 'function' ||
    typeof window.subscribe !== 'function' ||
    typeof window.reveal !== 'function'
  )
    return undefined;
  return window as ShellWindowApi;
}

export function revealDesktopWindow(): void {
  const shell = shellWindow();
  if (shell === undefined) {
    globalThis.focus?.();
    return;
  }
  void shell.reveal().catch(() => globalThis.focus?.());
}

export function shellLiveActivity(): ShellLiveActivityApi | undefined {
  const live = product()?.liveActivity;
  if (typeof live?.acquire !== 'function' || typeof live.release !== 'function') return undefined;
  return live as ShellLiveActivityApi;
}
