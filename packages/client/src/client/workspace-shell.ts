export interface WorkspaceLayoutCommand {
  toggleSidebar(): void;
}

export function claimSidebarCommand(
  layout: WorkspaceLayoutCommand,
  toggle: () => void,
): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(layout, 'toggleSidebar');
  const command = () => toggle();
  Object.defineProperty(layout, 'toggleSidebar', {
    configurable: true,
    writable: true,
    value: command,
  });
  return () => {
    if (layout.toggleSidebar !== command) return;
    if (descriptor === undefined) delete (layout as Partial<WorkspaceLayoutCommand>).toggleSidebar;
    else Object.defineProperty(layout, 'toggleSidebar', descriptor);
  };
}

export function mountWorkspaceShell(
  node: HTMLElement,
  layout: WorkspaceLayoutCommand,
  toggle: () => void,
): (() => void) | undefined {
  const mainSlot = node.closest('[data-slot="main"]');
  const main = mainSlot?.parentElement;
  const frame = main?.parentElement;
  const sidebar = frame?.querySelector<HTMLElement>(
    ':scope > div > [data-slot="sidebar"]',
  )?.parentElement;
  if (
    !main ||
    !frame ||
    !sidebar ||
    getComputedStyle(frame).display !== 'grid' ||
    !frame.querySelector(':scope > [data-rightbar-col]') ||
    !frame.querySelector(':scope > [data-shell-overlay]') ||
    frame.hasAttribute('data-bh-workspace-frame')
  )
    return;
  let releaseCommand: () => void;
  try {
    releaseCommand = claimSidebarCommand(layout, toggle);
  } catch {
    return;
  }
  frame.setAttribute('data-bh-workspace-frame', '');
  sidebar.setAttribute('data-bh-workspace-sidebar', '');
  main.setAttribute('data-bh-workspace-main', '');
  return () => {
    releaseCommand();
    frame.removeAttribute('data-bh-workspace-frame');
    sidebar.removeAttribute('data-bh-workspace-sidebar');
    main.removeAttribute('data-bh-workspace-main');
  };
}
