import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { HostSessionRow } from '@botharness/host-protocol/host-sessions';
import {
  latestSessionIds,
  type ImportableSession,
  SESSION_BOT_MAX,
  sessionActivityAt,
  sessionWorkspaces,
} from '@botharness/host-client/session-bot';

import type { BridgeActions } from './actions.js';
import { BotCreateSteps } from './bot-create-source.js';
import { Button } from './ds/button.js';
import { Checkbox } from './ds/checkbox.js';
import { EmptyState } from './ds/empty-state.js';
import { Field, TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { ListCard, ListCardItem } from './ds/list-card.js';
import { NumberStepper } from './ds/number-stepper.js';
import { Select } from './ds/select.js';
import { color, space, text } from './ds/tokens.stylex.js';
import { formatRelativeTime } from './labels.js';
import { marketplaceLanguage } from './marketplace-listing.js';
import { Tag } from './ds/tag.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { personaBotCreateError } from './persona-bot-create.js';

const ALL = '';
const LATEST_DEFAULT = 5;

const styles = stylex.create({
  picker: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  bar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.x3,
    minWidth: 0,
  },
  grow: { flexGrow: 1 },
  count: {
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontVariantNumeric: 'tabular-nums',
  },
  limit: { color: color.danger },
  list: { minWidth: 0 },
});

export function sessionSummary(row: HostSessionRow, now: number, t: BotHarnessTranslate): string {
  const when = formatRelativeTime(sessionActivityAt(row), now, t);
  return row.folderName === undefined ? when : `${row.folderName} · ${when}`;
}

export function CreateBotFromSessionsModal({
  actions,
  sectionId,
  t,
  target,
  onBack,
  onCancel,
  onCreated,
}: {
  actions: Pick<BridgeActions, 'importableSessions' | 'createBotFromSessions'>;
  sectionId?: string;
  t: BotHarnessTranslate;
  target?: ReactNode;
  onBack?: (() => void) | undefined;
  onCancel: () => void;
  onCreated: () => void;
}): ReactElement {
  const [rows, setRows] = useState<ImportableSession[]>();
  const [loadError, setLoadError] = useState<unknown>();
  const [workspace, setWorkspace] = useState(ALL);
  const [latest, setLatest] = useState(LATEST_DEFAULT);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [cause, setCause] = useState<unknown>();
  const [now] = useState(() => Date.now());
  const attempt = useRef<{ input: string; key: string } | undefined>(undefined);

  const load = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    void actions.importableSessions().then(
      (next) => {
        if (live) setRows(next);
      },
      (error: unknown) => {
        if (live) setLoadError(error);
      },
    );
    return () => {
      live = false;
    };
  }, [actions]);

  const workspaces = rows === undefined ? [] : sessionWorkspaces(rows);
  const scope = workspace === ALL ? undefined : workspace;
  const visible =
    rows === undefined ? [] : rows.filter((row) => scope === undefined || row.cwd === scope);
  const over = selected.size > SESSION_BOT_MAX;
  const granted = [
    ...new Set(
      (rows ?? []).flatMap((row) => (selected.has(row.sessionId) ? [row.workspacePath] : [])),
    ),
  ].sort();
  const invalid = displayName.trim().length === 0 || selected.size === 0 || over;
  const toggle = (id: string, on: boolean): void =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const pickWorkspace = (cwd: string): void => {
    setWorkspace(cwd);
    if (cwd === ALL) return;
    const name = workspaces.find((group) => group.cwd === cwd)?.name;
    if (displayName.trim().length === 0 && name !== undefined) setDisplayName(name);
  };

  const submit = (): void => {
    if (invalid || creating) return;
    setCreating(true);
    setCause(undefined);
    const about = description.trim();
    const sessionIds = [...selected].sort();
    const input = JSON.stringify([displayName.trim(), about, sessionIds]);
    if (attempt.current?.input !== input)
      attempt.current = { input, key: `sessions:${crypto.randomUUID()}` };
    void actions
      .createBotFromSessions(
        {
          displayName: displayName.trim(),
          sessionIds,
          ...(about.length === 0 ? {} : { description: about }),
          operationKey: attempt.current.key,
          language: marketplaceLanguage(t),
          workspacePaths: granted,
        },
        sectionId,
      )
      .then(onCreated, (error: unknown) => {
        setCause(error);
        setCreating(false);
      });
  };

  return (
    <FormDialog
      title={t('bot.create.sessions.title')}
      description={t('bot.create.sessions.description')}
      size="medium"
      scroll
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={
        creating
          ? t('bot.create.creating')
          : t('bot.create.sessions.submit', { count: selected.size })
      }
      submitDisabled={invalid}
      submitData={{ 'data-sessions-create': '' }}
      busy={creating}
      error={
        cause === undefined
          ? undefined
          : t('create.failed', { error: personaBotCreateError(cause, t) })
      }
      onCancel={() => {
        if (!creating) onCancel();
      }}
      onSubmit={submit}
    >
      {onBack ? <BotCreateSteps t={t} onBack={onBack} disabled={creating} /> : null}
      {target}
      <TextField
        label={t('bot.create.name.label')}
        value={displayName}
        disabled={creating}
        placeholder={t('bot.create.name.placeholder')}
        initialFocus
        onChange={setDisplayName}
      />
      <TextField
        label={t('bot.create.about.label')}
        value={description}
        disabled={creating}
        placeholder={t('bot.create.about.placeholder')}
        onChange={setDescription}
      />
      <Field label={t('bot.create.sessions.label')} group>
        {() => (
          <div ref={load} data-session-picker="" {...stylex.props(styles.picker)}>
            {loadError !== undefined ? (
              <EmptyState
                status
                title={t('bot.create.sessions.loadFailed')}
                description={personaBotCreateError(loadError, t)}
              />
            ) : rows === undefined ? (
              <EmptyState status title={t('bot.create.sessions.loading')} />
            ) : rows.length === 0 ? (
              <EmptyState
                title={t('bot.create.sessions.empty')}
                description={t('bot.create.sessions.emptyHint')}
              />
            ) : (
              <>
                <div {...stylex.props(styles.bar)}>
                  <Select
                    label={t('bot.create.sessions.workspace')}
                    value={workspace}
                    align="start"
                    disabled={creating}
                    options={[
                      { value: ALL, label: t('bot.create.sessions.allWorkspaces') },
                      ...workspaces.map((group) => ({
                        value: group.cwd,
                        label: `${group.name} (${group.sessionIds.length})`,
                      })),
                    ]}
                    onChange={pickWorkspace}
                  />
                  <span {...stylex.props(styles.grow)} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={creating}
                    data-sessions-all=""
                    onClick={() =>
                      setSelected(new Set(latestSessionIds(visible, SESSION_BOT_MAX, scope)))
                    }
                  >
                    {t('bot.create.sessions.selectAll')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={creating || selected.size === 0}
                    onClick={() => setSelected(new Set())}
                  >
                    {t('bot.create.sessions.clear')}
                  </Button>
                </div>
                <div {...stylex.props(styles.bar)}>
                  <NumberStepper
                    label={t('bot.create.sessions.latestCount')}
                    value={latest}
                    min={1}
                    max={SESSION_BOT_MAX}
                    disabled={creating}
                    decreaseLabel={t('bot.create.sessions.fewer')}
                    increaseLabel={t('bot.create.sessions.more')}
                    onChange={setLatest}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={creating}
                    data-sessions-latest=""
                    onClick={() => setSelected(new Set(latestSessionIds(visible, latest, scope)))}
                  >
                    {t('bot.create.sessions.selectLatest', { count: latest })}
                  </Button>
                  <span {...stylex.props(styles.grow)} />
                  <span
                    role="status"
                    data-sessions-selected={selected.size}
                    {...stylex.props(styles.count, over && styles.limit)}
                  >
                    {over
                      ? t('bot.create.sessions.overLimit', { max: SESSION_BOT_MAX })
                      : t('bot.create.sessions.selected', { count: selected.size })}
                  </span>
                </div>
                <div {...stylex.props(styles.list)}>
                  <ListCard label={t('bot.create.sessions.label')}>
                    {visible.map((row) => (
                      <ListCardItem
                        key={row.sessionId}
                        data={{ 'data-session-row': row.sessionId }}
                        title={
                          <Checkbox
                            checked={selected.has(row.sessionId)}
                            disabled={creating}
                            label={row.title ?? t('bot.create.sessions.untitled')}
                            onChange={(on) => toggle(row.sessionId, on)}
                          />
                        }
                        summary={sessionSummary(row, now, t)}
                      />
                    ))}
                  </ListCard>
                </div>
              </>
            )}
          </div>
        )}
      </Field>
      {granted.length === 0 ? null : (
        <Field label={t('bot.create.sessions.grants')} group>
          {() => (
            <div data-sessions-grants="" {...stylex.props(styles.bar)}>
              {granted.map((cwd) => (
                <Tag key={cwd}>{cwd}</Tag>
              ))}
            </div>
          )}
        </Field>
      )}
    </FormDialog>
  );
}
