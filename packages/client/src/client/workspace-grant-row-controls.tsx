import type { ReactElement, ReactNode } from 'react';
import { Icon } from './ds/icon.js';
import { SidebarCardRow } from './sidebar-card.js';

export function FolderSectionSummary({ children }: { children: ReactNode }): ReactElement {
  return (
    <summary className="bh-channel-sidebar-entry-head">
      <span className="bh-channel-sidebar-entry-chevron" aria-hidden="true">
        <Icon name="chevron-down" size={14} />
      </span>
      <span className="bh-channel-sidebar-entry-label">{children}</span>
    </summary>
  );
}

export function AddFolderRow({
  label,
  disabled,
  onAdd,
}: {
  label: string;
  disabled: boolean;
  onAdd: () => void;
}): ReactElement {
  return (
    <SidebarCardRow
      leading={<Icon name="plus" size={16} />}
      title={label}
      mainClassName="bh-workspace-folder-add"
      disabled={disabled}
      onClick={onAdd}
    />
  );
}

export function WorkspaceGrantConfirmation({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="bh-workspace-grant-confirm" role="group" aria-label={title}>
      <strong>{title}</strong>
      {children}
    </div>
  );
}
