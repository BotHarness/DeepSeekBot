import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import {
  canCreateFolders,
  newFolderNameProblem,
  newFolderRefusal,
  type NewFolderRefusal,
} from '@botharness/host-client/new-folder';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import type { BridgeActions } from './actions.js';
import type { WorkspaceOption } from './bridge.js';
import { errorMessage } from './bridge.js';
import { Button } from './ds/button.js';
import { TextField } from './ds/field.js';
import { Icon } from './ds/icon.js';
import { space } from './ds/tokens.stylex.js';
import { useTeamMode } from './team-state.js';

export type CreateFolder = (parent: string, name: string) => Promise<WorkspaceOption>;

const REFUSAL_KEYS = {
  exists: 'grant.newFolder.exists',
  'outside-grant': 'grant.newFolder.outsideGrant',
  denied: 'grant.newFolder.denied',
  permission: 'grant.newFolder.permission',
  invalid: 'grant.newFolder.segment',
} as const satisfies Record<NewFolderRefusal, string>;

const styles = stylex.create({
  form: { display: 'flex', flexDirection: 'column', gap: space.x3 },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: space.x2 },
  start: { display: 'flex' },
});

export function useCreateFolder(actions: {
  createHostFolder?: BridgeActions['createHostFolder'] | undefined;
  teamCall?: BridgeActions['teamCall'] | undefined;
}): CreateFolder | undefined {
  const team = useTeamMode(actions.teamCall);
  return canCreateFolders(team?.viewer) ? actions.createHostFolder : undefined;
}

export function NewFolderButton({
  disabled,
  onOpen,
  t,
}: {
  disabled: boolean;
  onOpen(): void;
  t: ChannelSidebarEntryProps['t'];
}): ReactElement {
  return (
    <div {...stylex.props(styles.start)}>
      <Button variant="outline" data-folder-browser-new="" disabled={disabled} onClick={onOpen}>
        <Icon name="folder-plus" size={16} />
        {t('grant.newFolder')}
      </Button>
    </div>
  );
}

export function NewFolderForm({
  parent,
  create,
  onCreated,
  onCancel,
  onBusy,
  t,
}: {
  parent: string;
  create: CreateFolder;
  onCreated(workspace: WorkspaceOption): void;
  onCancel(): void;
  onBusy(busy: boolean): void;
  t: ChannelSidebarEntryProps['t'];
}): ReactElement {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string>();
  const pending = useRef(false);
  const problem = newFolderNameProblem(name);
  const shown =
    problem === 'segment'
      ? t('grant.newFolder.segment')
      : problem === 'too-long'
        ? t('grant.newFolder.tooLong')
        : refused;

  const submit = (): void => {
    if (pending.current || problem !== undefined) return;
    pending.current = true;
    setBusy(true);
    onBusy(true);
    setRefused(undefined);
    void create(parent, name.trim())
      .then(onCreated, (cause: unknown) => {
        const refusal = newFolderRefusal(cause);
        setRefused(
          refusal === undefined
            ? `${t('grant.newFolderFailed')} ${errorMessage(cause)}`
            : t(REFUSAL_KEYS[refusal]),
        );
      })
      .finally(() => {
        pending.current = false;
        setBusy(false);
        onBusy(false);
      });
  };

  return (
    <form
      data-folder-browser-new-form=""
      {...stylex.props(styles.form)}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <TextField
        label={t('grant.newFolderName')}
        hint={t('grant.newFolderIn', { path: parent })}
        error={shown}
        placeholder={t('grant.newFolderPlaceholder')}
        value={name}
        disabled={busy}
        initialFocus
        autoFocus
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        onChange={(next) => {
          setName(next);
          setRefused(undefined);
        }}
      />
      <div {...stylex.props(styles.actions)}>
        <Button variant="outline" type="button" disabled={busy} onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" type="submit" disabled={busy || problem !== undefined}>
          {t('grant.newFolderCreate')}
        </Button>
      </div>
    </form>
  );
}
