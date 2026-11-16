import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import type { BridgeActions } from './actions.js';
import type { BridgeCall } from './bridge.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { useDelayedSearch } from './delayed-search.js';
import { TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { IconButton } from './ds/icon-button.js';
import { Note } from './ds/note.js';
import { Tooltip } from './ds/tooltip.js';
import { border, color, radius, size, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { teamRefusal, type TeamViewer } from './team-bridge.js';
import {
  addChannelHuman,
  loadChannelAccess,
  loadMemberCandidates,
  type ChannelAccess,
  type MemberCandidate,
} from './team-channels-bridge.js';
import { teamErrorText } from './team-settings.js';
import { useTeamMode } from './team-state.js';

const styles = stylex.create({
  results: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    minWidth: 0,
    minHeight: '120px',
    maxHeight: '280px',
    overflowY: 'auto',
  },
  option: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    width: '100%',
    minWidth: 0,
    minHeight: size.nav,
    paddingInline: space.x3,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    textAlign: 'start',
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '-2px',
  },
  optionOn: {
    backgroundColor: { default: color.selected, ':hover': color.selected },
  },
  initial: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '28px',
    height: '28px',
    borderRadius: radius.round,
    backgroundColor: color.well,
    color: color.muted,
    fontSize: text.metaSize,
    fontWeight: text.strong,
  },
  names: {
    display: 'flex',
    alignItems: 'baseline',
    gap: space.x2,
    minWidth: 0,
  },
  name: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  username: {
    flexShrink: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
});

export function canAddPeople(access: ChannelAccess | undefined, viewer: TeamViewer): boolean {
  if (access === undefined) return false;
  return (
    viewer.owner ||
    viewer.permissions.includes('channels.manageAll') ||
    access.role !== 'member' ||
    access.policy.addMembers === 'everyone'
  );
}

export function addPeopleErrorText(t: BotHarnessTranslate, error: unknown): string {
  return teamRefusal(error) === 'permission-required'
    ? t('channelPeople.denied')
    : teamErrorText(t, error);
}

export function AddPeopleAction({
  channelId,
  actions,
  t,
}: {
  readonly channelId: string;
  readonly actions: BridgeActions;
  readonly t: BotHarnessTranslate;
}): ReactElement | null {
  const call = actions.teamCall;
  const team = useTeamMode(call);
  const viewer = team?.enabled === true ? team.viewer : undefined;
  const [allowed, setAllowed] = useState<{ channelId: string; value: boolean }>();
  const [open, setOpen] = useState(false);
  const mount = useMountedResource<HTMLSpanElement>(() => {
    if (call === undefined || viewer === undefined) return undefined;
    const controller = new AbortController();
    loadChannelAccess(call, channelId, controller.signal)
      .then((access) => {
        if (!controller.signal.aborted)
          setAllowed({ channelId, value: canAddPeople(access, viewer) });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [call, channelId, viewer]);
  if (call === undefined || viewer === undefined) return null;
  const visible = allowed?.channelId === channelId && allowed.value;
  return (
    <>
      <span ref={mount} hidden />
      {visible ? (
        <Tooltip label={t('channelPeople.add')} side="bottom" delayMs={500}>
          <IconButton
            size="row"
            tone="subtle"
            aria-label={t('channelPeople.add')}
            aria-haspopup="dialog"
            data-channel-add-people=""
            onClick={() => setOpen(true)}
          >
            <ChannelSidebarIcon name="user-plus" size={16} />
          </IconButton>
        </Tooltip>
      ) : null}
      {open ? (
        <AddPeopleDialog
          call={call}
          channelId={channelId}
          t={t}
          onClose={() => setOpen(false)}
          onAdded={() => {
            setOpen(false);
            void actions.openChannel(channelId);
          }}
        />
      ) : null}
    </>
  );
}

export function AddPeopleDialog({
  call,
  channelId,
  t,
  onClose,
  onAdded,
}: {
  readonly call: BridgeCall;
  readonly channelId: string;
  readonly t: BotHarnessTranslate;
  readonly onClose: () => void;
  readonly onAdded: (humanId: string) => void;
}): ReactElement {
  const { query, delayedQuery, updateQuery, cancelOnUnmount } = useDelayedSearch(250, (value) =>
    value.trim(),
  );
  const [candidates, setCandidates] = useState<{
    query: string;
    people: readonly MemberCandidate[];
  }>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const results = useMountedResource<HTMLDivElement>(
    (node) => {
      cancelOnUnmount(node);
      const controller = new AbortController();
      loadMemberCandidates(call, channelId, delayedQuery, controller.signal)
        .then((people) => {
          if (controller.signal.aborted) return;
          setLoadFailed(false);
          setCandidates({ query: delayedQuery, people });
        })
        .catch(() => {
          if (!controller.signal.aborted) setLoadFailed(true);
        });
      return () => {
        controller.abort();
        cancelOnUnmount(null);
      };
    },
    [call, channelId, delayedQuery],
  );
  const people = loadFailed ? [] : (candidates?.people ?? []);
  const chosen = people.some((person) => person.humanId === selected) ? selected : undefined;
  const add = (): void => {
    if (chosen === undefined) return;
    setBusy(true);
    setError(undefined);
    addChannelHuman(call, channelId, chosen)
      .then(() => onAdded(chosen))
      .catch((failure: unknown) => {
        setError(addPeopleErrorText(t, failure));
        setBusy(false);
      });
  };
  return (
    <FormDialog
      title={t('channelPeople.add')}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('channelPeople.submit')}
      submitDisabled={chosen === undefined}
      busy={busy}
      error={error}
      onCancel={onClose}
      onSubmit={add}
      submitData={{ 'data-channel-add-people-submit': '' }}
    >
      <Note>{t('channelPeople.hint')}</Note>
      <TextField
        label={t('channelPeople.search')}
        value={query}
        placeholder={t('channelPeople.search')}
        onChange={updateQuery}
        initialFocus
      />
      <div
        ref={results}
        role="group"
        aria-label={t('channelPeople.select')}
        aria-busy={candidates?.query !== delayedQuery || undefined}
        {...stylex.props(styles.results)}
      >
        {loadFailed ? (
          <Note tone="danger">{t('channelPeople.loadFailed')}</Note>
        ) : candidates === undefined ? null : people.length === 0 ? (
          <Note>
            {t(candidates.query === '' ? 'channelPeople.empty' : 'channelPeople.emptySearch')}
          </Note>
        ) : (
          people.map((person) => (
            <button
              type="button"
              key={person.humanId}
              data-channel-add-option={person.humanId}
              aria-pressed={chosen === person.humanId}
              onClick={() => setSelected(person.humanId)}
              {...stylex.props(styles.option, chosen === person.humanId && styles.optionOn)}
            >
              <span aria-hidden="true" {...stylex.props(styles.initial)}>
                {person.displayName.slice(0, 1).toLocaleUpperCase()}
              </span>
              <span {...stylex.props(styles.names)}>
                <span {...stylex.props(styles.name)}>{person.displayName}</span>
                {person.username === undefined ? null : (
                  <span {...stylex.props(styles.username)}>@{person.username}</span>
                )}
              </span>
            </button>
          ))
        )}
      </div>
    </FormDialog>
  );
}
