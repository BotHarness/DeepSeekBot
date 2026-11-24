// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('expo-file-system', () => ({ File: class {}, Directory: class {}, Paths: {} }));
vi.mock('@botharness/host-client/host-look', () => ({
  createHostLooks: () => ({
    subscribe: () => () => {},
    look: (hostId: string) =>
      hostId === 'studio'
        ? { name: 'Studio\nOffice' }
        : hostId === 'laptop'
          ? { name: 'Laptop' }
          : {},
  }),
}));

import { useHostLocalNames } from '../src/host/native-host-look';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('keeps each local name at its Computer’s position even when a name has a newline', () => {
  let names: readonly string[] = [];
  function Probe() {
    names = useHostLocalNames(['studio', 'unnamed', 'laptop']);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(createElement(Probe)));
  expect(names).toEqual(['Studio\nOffice', '', 'Laptop']);
  act(() => root.unmount());
});
