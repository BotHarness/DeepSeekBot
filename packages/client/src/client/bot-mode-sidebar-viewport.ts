import { mobileBotViewport, subscribeMobileBotViewport } from './mobile-viewport.js';

export function botModeSidebarViewport(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !mobileBotViewport()
  );
}

export function subscribeBotModeSidebarViewport(listener: () => void): () => void {
  return subscribeMobileBotViewport(listener);
}
