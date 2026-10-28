// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { EndSheetProps } from '../src/ui/primitives/end-sheet';
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('../src/ui/primitives/end-sheet', () => ({
  EndSheet: ({ children, panel, open, active, onOpenChange }: EndSheetProps) => (
    <main>
      <section data-background>{children}</section>
      {active && open ? (
        <aside>
          {panel}
          <button onClick={() => onOpenChange(false)}>Scrim</button>
        </aside>
      ) : null}
    </main>
  ),
}));
import { ActivitySheetRoot, ActivitySheetRegistration } from '../src/ui/shell/activity-sheet-root';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it('owns filters above navigation, preserves choices on reopen and clears them when the scene leaves', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  let renders = 0;
  function Activity() {
    renders++;
    const [open, setOpen] = useState(false);
    const [choice, setChoice] = useState('default');
    return (
      <>
        <button onClick={() => setOpen(true)}>Filter</button>
        <ActivitySheetRegistration
          open={open}
          active
          enabled
          onOpenChange={setOpen}
          panel={<button onClick={() => setChoice('newest')}>{choice}</button>}
        />
      </>
    );
  }
  const render = (visible: boolean) =>
    act(async () =>
      root.render(
        <ActivitySheetRoot>
          {visible ? <Activity /> : null}
          <nav>Navigation</nav>
        </ActivitySheetRoot>,
      ),
    );
  const click = async (label: string) =>
    act(async () => {
      const button = [...container.querySelectorAll('button')].find((n) => n.textContent === label);
      expect(button).toBeDefined();
      button!.click();
    });
  try {
    await render(true);
    expect(renders).toBe(1);
    await click('Filter');
    expect(container.querySelector('aside')).not.toBeNull();
    expect(container.querySelector('[data-background] aside')).toBeNull();
    expect(container.querySelector('[data-background] nav')).not.toBeNull();
    await click('default');
    await click('Scrim');
    expect(container.querySelector('aside')).toBeNull();
    await click('Filter');
    expect(container.querySelector('aside')?.textContent).toContain('newest');
    await render(false);
    expect(container.querySelector('aside')).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});
