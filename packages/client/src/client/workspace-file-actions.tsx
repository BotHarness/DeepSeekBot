import { useMemo, type ReactElement } from 'react';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import {
  HostFileActionButton,
  HostFileOpenButton,
  type HostFileCommands,
} from './host-file-menu.js';

export type WorkspaceFileCommands = Pick<
  BridgeActions,
  'workspaceFileTarget' | 'workspaceFileApplications' | 'workspaceFileOpen'
> &
  Partial<Pick<BridgeActions, 'fileOpenPreferences'>>;

function useWorkspaceFileCommands(actions: WorkspaceFileCommands): HostFileCommands {
  return useMemo<HostFileCommands>(
    () => ({
      target: actions.workspaceFileTarget,
      applications: actions.workspaceFileApplications,
      open: actions.workspaceFileOpen,
      preferences: actions.fileOpenPreferences,
    }),
    [actions],
  );
}

export function WorkspaceFileActionButton({
  actions,
  slug,
  grantId,
  text,
  t,
}: {
  actions: WorkspaceFileCommands;
  slug: string;
  grantId: string;
  text: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const commands = useWorkspaceFileCommands(actions);
  return (
    <span className="bh-file-path-open">
      <HostFileActionButton
        actions={commands}
        slug={slug}
        path={grantId}
        text={text}
        className="bh-workspace-folder-path"
        t={t}
      />
      <HostFileOpenButton actions={commands} slug={slug} path={grantId} name={text} compact t={t} />
    </span>
  );
}

export function WorkspaceFilePathButton({
  actions,
  slug,
  grantId,
  text,
  t,
}: {
  actions: WorkspaceFileCommands;
  slug: string;
  grantId: string;
  text: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const commands = useWorkspaceFileCommands(actions);
  return (
    <HostFileActionButton
      actions={commands}
      slug={slug}
      path={grantId}
      text={text}
      className="bh-workspace-folder-path"
      t={t}
    />
  );
}

export function WorkspaceFileOpenButton({
  actions,
  slug,
  grantId,
  name,
  t,
}: {
  actions: WorkspaceFileCommands;
  slug: string;
  grantId: string;
  name: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const commands = useWorkspaceFileCommands(actions);
  return (
    <HostFileOpenButton actions={commands} slug={slug} path={grantId} name={name} compact t={t} />
  );
}
