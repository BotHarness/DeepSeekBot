import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';

export const BubbleHoveredContext = createContext(false);

const listeners = new Set<() => void>();
let keyboardNavigation = false;
let listening = false;

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Tab' || event.defaultPrevented) return;
  keyboardNavigation = true;
  window.removeEventListener('keydown', onKeyDown);
  listeners.forEach((notify) => notify());
}

function subscribe(listener: () => void): () => void {
  if (!listening && !keyboardNavigation && typeof window !== 'undefined') {
    listening = true;
    window.addEventListener('keydown', onKeyDown);
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const usingKeyboard = (): boolean => keyboardNavigation;
const serverSnapshot = (): boolean => false;

export function BubbleToolbar({ children }: { children: ReactNode }): ReactElement | null {
  const hovered = useContext(BubbleHoveredContext);
  const keyboard = useSyncExternalStore(subscribe, usingKeyboard, serverSnapshot);
  return hovered || keyboard ? <div className="bh-bubble-toolbar">{children}</div> : null;
}
