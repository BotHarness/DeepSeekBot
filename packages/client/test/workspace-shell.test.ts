// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { claimSidebarCommand, mountWorkspaceShell } from '../src/client/workspace-shell.js';

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-windows-titlebar');
});

describe('workspace shell ownership', () => {
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

  it('claims only the qualified shell and disposes all its markers', () => {
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
    document.documentElement.setAttribute('data-windows-titlebar', '');
    expect(mountWorkspaceShell(node, layout, vi.fn())).toBeUndefined();
    document.documentElement.removeAttribute('data-windows-titlebar');
    document.querySelector('[data-shell-overlay]')!.remove();
    expect(mountWorkspaceShell(node, layout, vi.fn())).toBeUndefined();
    expect(layout.toggleSidebar).not.toHaveBeenCalled();
  });
});
