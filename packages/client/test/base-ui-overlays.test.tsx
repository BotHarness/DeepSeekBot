// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./primitive-mocks.js')).shellPrimitives(),
);

import { Menu, MenuItemButton } from '../src/client/ds/menu.js';
import { Modal } from '../src/client/ds/modal.js';
import { Toast } from '../src/client/ds/toast.js';
import { Tooltip } from '../src/client/ds/tooltip.js';
import { flushOverlayFrames, menuItem, openSubmenu, openTooltip } from './primitive-mocks.js';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('selects ordinary and footer rows, keeps disabled rows inert and marks every selected id', async () => {
  const select = vi.fn();
  await act(async () =>
    root.render(
      <Menu
        open
        portal
        anchor={<button>Open</button>}
        onClose={() => {}}
        selectedIds={['first', 'footer']}
        onSelect={select}
        items={[
          { id: 'first', label: 'First' },
          { id: 'locked', label: 'Locked', disabled: true },
        ]}
        footer={[{ id: 'footer', label: 'Footer' }]}
      />,
    ),
  );
  expect(host.querySelector('[role="menu"]')).toBeNull();
  expect(menuItem('First').getAttribute('aria-checked')).toBe('true');
  expect(menuItem('Footer').getAttribute('aria-checked')).toBe('true');
  await act(async () => menuItem('Locked').click());
  expect(select).not.toHaveBeenCalled();
  await act(async () => menuItem('First').click());
  await act(async () => menuItem('Footer').click());
  expect(select.mock.calls).toEqual([['first'], ['footer']]);
});

it('opens submenu rows in the owning portal container and preserves fill selection', async () => {
  const container = document.createElement('section');
  document.body.append(container);
  const select = vi.fn();
  try {
    await act(async () =>
      root.render(
        <Menu
          open
          container={container}
          anchor={<button>Open</button>}
          onClose={() => {}}
          onSelect={select}
          selectedId="child"
          selection="fill"
          items={[{ id: 'parent', label: 'Parent', submenu: [{ id: 'child', label: 'Child' }] }]}
        />,
      ),
    );
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    await openSubmenu(menuItem('Parent'));
    const child = menuItem('Child');
    expect(container.contains(child)).toBe(true);
    expect(child.hasAttribute('data-selected')).toBe(true);
    expect(child.hasAttribute('aria-checked')).toBe(false);
    await act(async () => child.click());
    expect(select).toHaveBeenCalledExactlyOnceWith('child');
  } finally {
    await act(async () => root.render(null));
    container.remove();
  }
});

it('closes on Escape and restores the element that opened the menu', async () => {
  function View() {
    const [open, setOpen] = useState(false);
    return (
      <Menu
        open={open}
        autoFocus
        portal
        onClose={() => setOpen(false)}
        anchor={<button onClick={() => setOpen(true)}>Open</button>}
        items={[{ id: 'first', label: 'First' }]}
      />
    );
  }
  await act(async () => root.render(<View />));
  const trigger = host.querySelector('button')!;
  await act(async () => {
    trigger.focus();
    trigger.click();
  });
  await flushOverlayFrames();
  expect(document.activeElement).toBe(menuItem('First'));
  await act(async () =>
    menuItem('First').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  await flushOverlayFrames();
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it('keeps focus moved by a selected action and does not dismiss its success feedback', async () => {
  function View() {
    const [open, setOpen] = useState(false);
    const [done, setDone] = useState(false);
    return (
      <>
        <button data-destination>Destination</button>
        {open ? (
          <Menu
            open
            portal
            autoFocus
            anchor={<span />}
            items={[{ id: 'done', label: 'Done' }]}
            onClose={() => {
              setOpen(false);
              setDone(false);
            }}
            onSelect={() => {
              host.querySelector<HTMLButtonElement>('[data-destination]')!.focus();
              setOpen(false);
              setDone(true);
            }}
          />
        ) : (
          <button data-open onClick={() => setOpen(true)}>
            Open
          </button>
        )}
        {done ? <p role="status">Saved</p> : null}
      </>
    );
  }
  await act(async () => root.render(<View />));
  await act(async () => host.querySelector<HTMLButtonElement>('[data-open]')!.click());
  await flushOverlayFrames();
  await act(async () => menuItem('Done').click());
  await flushOverlayFrames();
  expect(host.querySelector('[role="status"]')?.textContent).toBe('Saved');
  expect(document.activeElement).toBe(host.querySelector('[data-destination]'));
});

it('cancels pointer-leave dismissal and autofocus work when its popup detaches', async () => {
  vi.useFakeTimers();
  const close = vi.fn();
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  await act(async () =>
    root.render(
      <Menu
        open
        autoFocus
        closeOnPointerLeave
        portal
        onClose={close}
        anchor={<button>Open</button>}
        items={[{ id: 'first', label: 'First' }]}
      />,
    ),
  );
  const focus = vi.spyOn(menuItem('First'), 'focus');
  await act(async () =>
    document
      .querySelector('[role="menu"]')!
      .dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body })),
  );
  await act(async () => root.render(null));
  await act(async () => {
    for (const callback of [...frames.values()]) callback(0);
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(close).not.toHaveBeenCalled();
  expect(focus).not.toHaveBeenCalled();
});

it('keeps a disabled reason accessible in a native DSH menu without a Base UI root', async () => {
  const select = vi.fn();
  await act(async () =>
    root.render(
      <MenuItemButton disabled disabledReason="Wait for the Host" onSelect={select}>
        Retry
      </MenuItemButton>,
    ),
  );
  const item = menuItem('Retry');
  expect(item.getAttribute('aria-disabled')).toBe('true');
  expect(item.getAttribute('aria-description')).toBe('Wait for the Host');
  expect(item.title).toBe('Wait for the Host');
  await act(async () => {
    item.focus();
    item.click();
  });
  expect(document.activeElement).toBe(item);
  expect(select).not.toHaveBeenCalled();
});

it('preserves its child ref and connects the tooltip to the accessible description', async () => {
  const attach = vi.fn();
  await act(async () =>
    root.render(
      <Tooltip label="First">
        <button ref={attach}>Action</button>
      </Tooltip>,
    ),
  );
  const count = attach.mock.calls.length;
  await act(async () =>
    root.render(
      <Tooltip label="Second">
        <button ref={attach}>Action</button>
      </Tooltip>,
    ),
  );
  expect(attach).toHaveBeenCalledTimes(count);
  const trigger = host.querySelector('button')!;
  const popup = await openTooltip(trigger);
  expect(popup.textContent).toBe('Second');
  expect(trigger.getAttribute('aria-describedby')).toBe(popup.id);
});

it('shows a clipped-only tooltip after overflow and keeps click-open help operable', async () => {
  await act(async () =>
    root.render(
      <Tooltip label="Full name" onlyWhenClipped>
        <button>Short</button>
      </Tooltip>,
    ),
  );
  const trigger = host.querySelector('button')!;
  await act(async () => trigger.focus());
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  Object.defineProperty(trigger, 'scrollWidth', { configurable: true, value: 100 });
  Object.defineProperty(trigger, 'clientWidth', { configurable: true, value: 40 });
  await act(async () => trigger.blur());
  expect((await openTooltip(trigger)).textContent).toBe('Full name');
  await act(async () => root.render(null));
  await act(async () =>
    root.render(
      <Tooltip label="Help" openOnClick>
        <button onClick={(event) => event.preventDefault()}>Info</button>
      </Tooltip>,
    ),
  );
  await act(async () => host.querySelector('button')!.click());
  expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Help');
});

it('renders the Modal title, description, content and footer with an accessible close button', async () => {
  const close = vi.fn();
  await act(async () =>
    root.render(
      <Modal
        open
        title="Edit"
        description="Details"
        closeLabel="Close"
        onClose={close}
        footer={<button>Save</button>}
      >
        <input aria-label="Name" />
      </Modal>,
    ),
  );
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.getAttribute('aria-label')).toBe('Edit');
  expect(dialog.querySelector('h2')?.textContent).toBe('Edit');
  expect(dialog.textContent).toContain('Details');
  expect(dialog.querySelector('input')).not.toBeNull();
  expect(dialog.textContent).toContain('Save');
  await act(async () =>
    dialog.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click(),
  );
  expect(close).toHaveBeenCalledOnce();
});

it('portals Toast actions and pauses dismissal while the toast has focus', async () => {
  vi.useFakeTimers();
  const done = vi.fn();
  const action = vi.fn();
  await act(async () =>
    root.render(
      <Toast
        text="Saved"
        holdMs={100}
        onDone={done}
        actions={[{ label: 'Undo', prefix: '↶', onClick: action }]}
      />,
    ),
  );
  const status = document.querySelector<HTMLElement>('[role="status"]')!;
  expect(host.contains(status)).toBe(false);
  expect(status.getAttribute('aria-live')).toBe('polite');
  const button = status.querySelector('button')!;
  expect(button.textContent).toBe('↶ Undo');
  await act(async () => {
    button.focus();
    button.click();
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(action).toHaveBeenCalledOnce();
  expect(done).not.toHaveBeenCalled();
  await act(async () => {
    button.blur();
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(done).toHaveBeenCalledOnce();
});
