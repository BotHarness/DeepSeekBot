import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Input } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeCall } from './bridge.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { EmptyState } from './ds/empty-state.js';
import { FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { color, radius, size, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { filterDirectory } from './channel-access.js';
import { loadTeamDirectory, openHumanDm, type DirectoryEntry } from './team-channels-bridge.js';
import { teamErrorText } from './team-settings.js';

const styles = stylex.create({
  list: {
    display: 'flex',
    flexDirection: 'column',
    margin: 0,
    marginTop: space.x2,
    padding: 0,
    listStyle: 'none',
    minWidth: 0,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    width: '100%',
    minHeight: size.row,
    paddingBlock: space.x2,
    paddingInline: space.x2,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    textAlign: 'start',
    cursor: 'pointer',
  },
  icon: { display: 'inline-flex', flexShrink: 0, color: color.muted },
  name: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

type Load =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; people: readonly DirectoryEntry[] };

export function MessagePersonDialog({
  call,
  t,
  onClose,
  onOpened,
  onOpening,
  target,
  unavailable = false,
}: {
  call?: BridgeCall | undefined;
  t: BotHarnessTranslate;
  onClose(): void;
  onOpened(channelId: string, person: DirectoryEntry, signal: AbortSignal): void | Promise<void>;
  onOpening?(): void;
  target?: ReactNode;
  unavailable?: boolean;
}): ReactElement {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState<string>();
  const [error, setError] = useState<string>();
  const active = useRef<AbortController>();
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    active.current = controller;
    setLoad({ state: 'loading' });
    setQuery('');
    setOpening(undefined);
    setError(undefined);
    if (call !== undefined && !unavailable)
      loadTeamDirectory(call, controller.signal)
        .then((people) => {
          if (!controller.signal.aborted) setLoad({ state: 'ready', people });
        })
        .catch(() => {
          if (!controller.signal.aborted) setLoad({ state: 'failed' });
        });
    return () => {
      controller.abort();
      if (active.current === controller) active.current = undefined;
    };
  }, [call, unavailable]);
  const open = async (person: DirectoryEntry): Promise<void> => {
    const signal = active.current?.signal;
    if (call === undefined || unavailable || signal === undefined || signal.aborted) return;
    setOpening(person.humanId);
    setError(undefined);
    try {
      onOpening?.();
      const channelId = await openHumanDm(call, person.humanId, signal);
      if (!signal.aborted) await onOpened(channelId, person, signal);
    } catch (failure) {
      if (!signal.aborted) {
        setError(teamErrorText(t, failure));
        setOpening(undefined);
      }
    }
  };
  const people = load.state === 'ready' ? filterDirectory(load.people, query) : [];
  return (
    <FormDialog
      title={t('team.dm.title')}
      size="medium"
      labels={{ close: t('common.close'), cancel: t('common.close') }}
      submitLabel=""
      onCancel={onClose}
      onClose={onClose}
      showCancel={false}
      scroll
      error={error === undefined ? undefined : <Note tone="danger">{error}</Note>}
    >
      <div ref={mount}>
        {target}
        {unavailable ? null : load.state === 'loading' ? (
          <Note>{t('team.dm.loading')}</Note>
        ) : load.state === 'failed' ? (
          <Note tone="danger">{t('team.dm.loadFailed')}</Note>
        ) : load.people.length === 0 ? (
          <EmptyState title={t('team.dm.empty')} />
        ) : (
          <>
            <Input
              value={query}
              placeholder={t('team.dm.search')}
              aria-label={t('team.dm.search')}
              autoFocus
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            {people.length === 0 ? (
              <Note>{t('team.dm.noMatch')}</Note>
            ) : (
              <ul {...stylex.props(styles.list)} aria-label={t('team.dm.title')}>
                {people.map((person) => (
                  <li key={person.humanId} data-team-person={person.humanId}>
                    <button
                      type="button"
                      disabled={opening !== undefined}
                      aria-busy={opening === person.humanId || undefined}
                      onClick={() => void open(person)}
                      {...stylex.props(styles.row)}
                    >
                      <span {...stylex.props(styles.icon)}>
                        <ChannelSidebarIcon name="user" size={16} />
                      </span>
                      <span {...stylex.props(styles.name)}>{person.displayName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </FormDialog>
  );
}
