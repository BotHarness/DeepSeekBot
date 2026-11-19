import { getWindowClass } from './ds/window-class.js';

export function botModeSidebarViewport(): boolean {
  return typeof window !== 'undefined' && getWindowClass() !== 'compact';
}
