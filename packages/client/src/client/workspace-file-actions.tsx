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
  const commands = useMemo<HostFileCommands>(
    () => ({
      target: actions.workspaceFileTarget,
      applications: actions.workspaceFileApplications,
      open: actions.workspaceFileOpen,
      preferences: actions.fileOpenPreferences,
    }),
    [actions],
  );
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
