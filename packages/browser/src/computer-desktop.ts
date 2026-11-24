import type { LocalDesktopControl } from '../../computer/src/local-video-contract.js';

interface ComputerTools {
  desktopControl?(): LocalDesktopControl;
  runDesktopOperation?<T>(operation: () => Promise<T>): Promise<T>;
}

export function browserComputerDesktop(lookup: () => unknown, target: () => string) {
  const computer = () => lookup() as ComputerTools | undefined;
  const control = () => {
    const state = computer()?.desktopControl?.();
    if (state?.desktop !== true) return undefined;
    const selected = target();
    if (selected === 'local' || (selected !== 'container' && (state.currentDesktop || state.held)))
      return state;
  };
  return {
    control,
    headless(preference: boolean): boolean {
      const state = control();
      if (state?.ready === false)
        throw new Error(
          'Check the current desktop in Computer settings before opening the Bot Browser.',
        );
      return preference && state === undefined;
    },
    run: <T>(operation: () => Promise<T>): Promise<T> =>
      (control() === undefined ? undefined : computer()?.runDesktopOperation?.(operation)) ??
      operation(),
  };
}
