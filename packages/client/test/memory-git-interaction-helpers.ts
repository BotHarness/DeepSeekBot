import { type Root } from 'react-dom/client';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach } from 'vitest';
import { setMemoryView } from '../src/client/memory-view-prefs.js';

const SHA = 'a'.repeat(40);

let container: HTMLDivElement;

let root: Root;

export { SHA, container, root };

export function registerMemoryGitHooks() {
  beforeEach(() => {
    setMemoryView('graph');
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
}
