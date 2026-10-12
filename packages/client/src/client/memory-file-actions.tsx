import { useMemo, type ReactElement } from 'react';
import type { BridgeActions } from './actions.js';
import { BridgeCallError } from './bridge.js';
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

export function MemoryCurrentFileOpenButton({
  actions,
  slug,
  path,
  deletion,
  t,
}: {
  actions: MemoryFileCommands;
  slug: string;
  path: string;
  deletion?: 'commit' | 'working' | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const commands = useMemo<HostFileCommands>(() => {
    const base = memoryCommands(actions);
    const explain = (failure: unknown): never => {
      if (failure instanceof BridgeCallError && failure.code === 'not-found')
        throw new Error(
          t('memory.currentFileMissing') +
            (deletion === 'commit'
              ? t('memory.currentFileDeletedByCommit')
              : deletion === 'working'
                ? t('memory.currentFileDeletedInWorking')
                : ''),
        );
      throw failure;
    };
    return {
      ...base,
      target: (owner, id) => base.target(owner, id).catch(explain),
      applications: (owner, id) => base.applications(owner, id).catch(explain),
      open: (owner, id, choice) => base.open(owner, id, choice).catch(explain),
      download: (owner, id) => actions.memoryFileDownload(owner, id).catch(explain),
    };
  }, [actions, deletion, t]);
  return (
    <HostFileOpenButton
      actions={commands}
      slug={slug}
      path={path}
      name={path}
      label={t('memory.openCurrentFile')}
      hint={t('memory.openCurrentFileHint')}
      t={t}
    />
  );
}
