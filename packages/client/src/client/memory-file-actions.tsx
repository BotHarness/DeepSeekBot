import { useMemo, type ReactElement } from 'react';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import {
  HostFileActionButton,
  HostFileOpenButton,
  useHostFileMenu,
  type HostFileCommands,
} from './host-file-menu.js';

export type MemoryFileCommands = Pick<
  BridgeActions,
  'memoryFileTarget' | 'memoryFileApplications' | 'memoryFileOpen' | 'memoryFileDownload'
> &
  Partial<Pick<BridgeActions, 'fileOpenPreferences'>>;

function memoryCommands(actions: MemoryFileCommands): HostFileCommands {
  return {
    target: actions.memoryFileTarget,
    applications: actions.memoryFileApplications,
    open: actions.memoryFileOpen,
    download: actions.memoryFileDownload,
    preferences: actions.fileOpenPreferences,
  };
}

export function useMemoryFileMenu(
  actions: MemoryFileCommands | undefined,
  slug: string | undefined,
  t: BotHarnessTranslate,
) {
  const commands = useMemo(
    () => (actions === undefined ? undefined : memoryCommands(actions)),
    [actions],
  );
  const menu = useHostFileMenu(commands, slug, t);
  return { ...menu, openPath: menu.openTargetId };
}

export function MemoryFileActionButton({
  actions,
  ...props
}: {
  actions: MemoryFileCommands;
  slug: string;
  path: string;
  text?: string;
  className?: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const commands = useMemo(() => memoryCommands(actions), [actions]);
  return <HostFileActionButton actions={commands} {...props} />;
}

export function MemoryFileOpenButton({
  actions,
  ...props
}: {
  actions: MemoryFileCommands;
  slug: string;
  path: string;
  name: string;
  compact?: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  const commands = useMemo(() => memoryCommands(actions), [actions]);
  return <HostFileOpenButton actions={commands} {...props} />;
}
