// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { claimSidebarCommand, mountWorkspaceShell } from '../src/client/workspace-shell.js';
import { WORKSPACE_CSS } from '../src/client/workspace-styles.js';

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-windows-titlebar');
  document.documentElement.removeAttribute('data-fullscreen');
  document.head.querySelector('[data-workspace-test-styles]')?.remove();
});

describe('workspace shell ownership', () => {
  it('gives Windows blank headers and rail window drag while recalling titles and controls', () => {
    document.documentElement.setAttribute('data-windows-titlebar', '');
    const styles = document.createElement('style');
    styles.setAttribute('data-workspace-test-styles', '');
    styles.textContent = WORKSPACE_CSS.replaceAll('-webkit-app-region', '--test-app-region');
    document.head.append(styles);
    document.body.innerHTML = `<div id="root"><div data-workspace-dock>
      <div class="dv-tabs-and-actions-container"><div class="dv-tab">
        <div data-window-drag><button data-panel-hide>Messages</button>
        <span data-window-drag-recall>Channel name</span><button>Settings</button></div>
      </div></div><div class="bh-workspace-controls" data-window-drag><button>Home</button></div>
      </div></div><div role="menu">Overlay</div>`;
    const region = (node: Element) => getComputedStyle(node).getPropertyValue('--test-app-region');
    for (const node of document.querySelectorAll(
      '[data-window-drag], .dv-tab, .dv-tabs-and-actions-container',
    ))
      expect(region(node)).toBe('drag');
    for (const node of document.querySelectorAll(
      'button, [data-window-drag-recall], [role="menu"]',
    ))
      expect(region(node)).toBe('no-drag');
    document.documentElement.removeAttribute('data-windows-titlebar');
    expect(region(document.querySelector('[data-window-drag]')!)).not.toBe('drag');
  });

  it('routes both native menu and keyboard command calls and restores the inherited command', () => {
    const native = vi.fn();
    const layout = Object.create({ toggleSidebar: native });
    const toggleChannels = vi.fn();
    const release = claimSidebarCommand(layout, toggleChannels);
    const nativeResolver = () => layout.toggleSidebar();
    nativeResolver();
    nativeResolver();
    expect(toggleChannels).toHaveBeenCalledTimes(2);
    expect(native).not.toHaveBeenCalled();
    release();
    nativeResolver();
    expect(native).toHaveBeenCalledTimes(1);
    expect(Object.hasOwn(layout, 'toggleSidebar')).toBe(false);
  });

  it('restores the exact own descriptor without overwriting a later owner', () => {
    const native = vi.fn();
    const layout = { toggleSidebar: native };
    const before = Object.getOwnPropertyDescriptor(layout, 'toggleSidebar');
    claimSidebarCommand(layout, vi.fn())();
    expect(Object.getOwnPropertyDescriptor(layout, 'toggleSidebar')).toEqual(before);
    const release = claimSidebarCommand(layout, vi.fn());
    const other = vi.fn();
    layout.toggleSidebar = other;
    release();
    expect(layout.toggleSidebar).toBe(other);
  });

  it.each([false, true])(
    'enables the Windows workspace without taking native chrome ownership (fullscreen=%s)',
    (fullscreen) => {
      document.documentElement.setAttribute('data-windows-titlebar', '');
      if (fullscreen) document.documentElement.setAttribute('data-fullscreen', '');
      const styles = document.createElement('style');
      styles.setAttribute('data-workspace-test-styles', '');
      styles.textContent = `
        .native-frame { display:grid; padding-top:40px; box-sizing:border-box; }
        ${WORKSPACE_CSS}
      `;
      document.head.append(styles);
      document.body.innerHTML = `
        <div class="native-frame" style="grid-template-columns:280px 1fr 0px">
          <div><div data-slot="sidebar"></div></div>
          <div><div data-slot="main"><div id="workspace"></div></div></div>
          <div data-rightbar-col></div>
          <div data-shell-bottom></div>
          <div data-shell-overlay></div>
        </div>`;
      const chrome = document.createElement('div');
      chrome.setAttribute('data-windows-menu', '');
      const shadow = chrome.attachShadow({ mode: 'open' });
      shadow.innerHTML =
        '<div role="menubar"><button>Application</button><button>Edit</button></div>';
      document.body.append(chrome);
      const frame = document.querySelector<HTMLElement>('.native-frame')!;
      const original = frame.outerHTML;
      const chromeMarkup = shadow.innerHTML;
      const nativeClick = vi.fn();
      shadow.addEventListener('click', nativeClick);
      const layout = { toggleSidebar: vi.fn() };
      const originalCommand = layout.toggleSidebar;
      const toggleChannels = vi.fn();
      const node = document.getElementById('workspace')!;
      for (let entry = 0; entry < 2; entry++) {
        const release = mountWorkspaceShell(node, layout, toggleChannels);
        expect(release).toBeTypeOf('function');
        expect(document.body.querySelector('[data-windows-menu]')).toBe(chrome);
        expect(shadow.innerHTML).toBe(chromeMarkup);
        expect(getComputedStyle(frame).paddingTop).toBe('40px');
        expect(getComputedStyle(frame).gridTemplateColumns).toBe('280px 1fr 0px');
        const main = frame.querySelector<HTMLElement>('[data-bh-workspace-main]')!;
        expect(getComputedStyle(main).gridColumn).toBe('1 / 3');
        expect(getComputedStyle(main).gridRow).toBe('1');
        expect(getComputedStyle(chrome).display).not.toBe('none');
        for (const button of shadow.querySelectorAll('button')) button.click();
        expect(nativeClick).toHaveBeenCalledTimes((entry + 1) * 2);
        layout.toggleSidebar();
        expect(toggleChannels).toHaveBeenCalledTimes(entry + 1);
        expect(document.documentElement.hasAttribute('data-windows-titlebar')).toBe(true);
        release!();
        expect(frame.outerHTML).toBe(original);
        expect(layout.toggleSidebar).toBe(originalCommand);
      }
    },
  );

  it.each([false, true])(
    'claims only the qualified shell and disposes all its markers (Windows=%s)',
    (windows) => {
      if (windows) document.documentElement.setAttribute('data-windows-titlebar', '');
      document.body.innerHTML =
        '<div style="display:grid"><div><div data-slot="sidebar"></div></div><div><div data-slot="main"><div id="workspace"></div></div></div><div data-rightbar-col></div><div data-shell-overlay></div></div>';
      const node = document.getElementById('workspace')!;
      const layout = { toggleSidebar: vi.fn() };
      const release = mountWorkspaceShell(node, layout, vi.fn());
      expect(release).toBeTypeOf('function');
      expect(document.querySelectorAll('[data-bh-workspace-frame]')).toHaveLength(1);
      expect(mountWorkspaceShell(node, layout, vi.fn())).toBeUndefined();
      release!();
      expect(
        document.querySelector(
          '[data-bh-workspace-frame], [data-bh-workspace-main], [data-bh-workspace-sidebar]',
        ),
      ).toBeNull();
      document.querySelector('[data-shell-overlay]')!.remove();
      expect(mountWorkspaceShell(node, layout, vi.fn())).toBeUndefined();
      expect(layout.toggleSidebar).not.toHaveBeenCalled();
    },
  );
});
