import { createBrowserUuid } from '@botharness/host-protocol/browser-uuid';
import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  folderDrafts,
  grantPreview,
  type ImportableSession,
  type SessionBotInput,
  SESSION_BOT_MAX,
  sessionWorkspaces,
} from '@botharness/host-client/session-bot';
import { sessionSummary } from './bot-create-sessions.js';
import { styles as stepStyles } from './bot-intro-step-styles.js';
import { Button } from './ds/button.js';
import { Checkbox } from './ds/checkbox.js';
import { Icon } from './ds/icon.js';
import { IconButton } from './ds/icon-button.js';
import { Input } from './ds/input.js';
import { ListCard, ListCardItem } from './ds/list-card.js';
import { ReadFailure } from './ds/read-failure.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { marketplaceLanguage } from './marketplace-listing.js';
import { personaBotCreateError } from './persona-bot-create.js';

export const IMPORT_RECENT = 10;

const styles = stylex.create({
  bar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.x3, minWidth: 0 },
  grow: { flexGrow: 1 },
  name: { width: '100%' },
  summary: { fontVariantNumeric: 'tabular-nums' },
  warn: { color: color.danger },
  done: { color: color.accent, display: 'inline-flex' },
  folders: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    padding: space.x3,
    borderRadius: radius.md,
    backgroundColor: color.modal,
  },
  folder: { display: 'flex', flexDirection: 'column', gap: space.x1, minWidth: 0 },
  sessions: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    paddingInlineStart: space.x6,
    paddingBlock: space.x1,
  },
  session: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  meta: {
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontVariantNumeric: 'tabular-nums',
  },
  indent: { paddingInlineStart: space.x6 },
});

interface Draft {
  id: string;
  name: string;
  sessionIds: readonly string[];
}

let nextDraft = 0;
const draftId = (): string => `draft-${(nextDraft += 1)}`;

export function ImportPlan({
  rows,
  t,
  add,
  onStart,
  onDone,
}: {
  rows: readonly ImportableSession[];
  t: BotHarnessTranslate;
  add(input: SessionBotInput): Promise<unknown>;
  onStart(): void;
  onDone(created: number): void;
}): ReactElement {
  const [drafts, setDrafts] = useState<readonly Draft[]>(() =>
    folderDrafts(rows, IMPORT_RECENT).map((draft) => ({ ...draft, id: draftId() })),
  );
  const [editing, setEditing] = useState<string>();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [created, setCreated] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [cause, setCause] = useState<unknown>();
  const [now] = useState(() => Date.now());
  const attempts = useRef(new Map<string, { input: string; key: string }>());
  const folders = sessionWorkspaces(rows);
  const byId = new Map(rows.map((row) => [row.sessionId, row]));
  const folderOf = new Map(
    folders.flatMap((folder) => folder.sessionIds.map((id) => [id, folder.name] as const)),
  );
  const pending = drafts.filter((draft) => !created.has(draft.id));
  const valid = (draft: Draft): boolean =>
    draft.name.trim().length > 0 &&
    draft.sessionIds.length > 0 &&
    draft.sessionIds.length <= SESSION_BOT_MAX;
  const ready = pending.length > 0 && pending.every(valid);
  const update = (id: string, patch: Partial<Draft>): void =>
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)),
    );
  const pick = (draft: Draft, ids: readonly string[], on: boolean): void => {
    const next = new Set(draft.sessionIds);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    update(draft.id, { sessionIds: rows.map((row) => row.sessionId).filter((id) => next.has(id)) });
  };
  const describe = (draft: Draft): string => {
    if (draft.sessionIds.length === 0) return t('intro.import.plan.empty');
    if (draft.sessionIds.length > SESSION_BOT_MAX)
      return t('intro.import.plan.over', { max: SESSION_BOT_MAX });
    const names = [...new Set(draft.sessionIds.flatMap((id) => folderOf.get(id) ?? []))].join(
      t('intro.import.join'),
    );
    return t('intro.import.plan.summary', { count: draft.sessionIds.length, folders: names });
  };

  const create = async (): Promise<void> => {
    if (!ready || busy) return;
    setBusy(true);
    setCause(undefined);
    setEditing(undefined);
    onStart();
    let count = created.size;
    for (const draft of pending) {
      const sessionIds = [...draft.sessionIds].sort();
      const displayName = draft.name.trim();
      const input = JSON.stringify([displayName, sessionIds]);
      const previous = attempts.current.get(draft.id);
      const attempt =
        previous?.input === input ? previous : { input, key: `sessions:${createBrowserUuid()}` };
      attempts.current.set(draft.id, attempt);
      const { paths, added } = grantPreview(rows, new Set(sessionIds));
      try {
        await add({
          displayName,
          sessionIds,
          operationKey: attempt.key,
          language: marketplaceLanguage(t),
          workspacePaths: paths,
          ...(added.length === 0 ? {} : { addWorkspaces: true }),
        });
      } catch (error: unknown) {
        setCause(error);
        setBusy(false);
        return;
      }
      count += 1;
      setCreated((current) => new Set([...current, draft.id]));
    }
    setBusy(false);
    onDone(count);
  };

  const editor = (draft: Draft): ReactElement => {
    const chosen = new Set(draft.sessionIds);
    return (
      <div
        {...stylex.props(styles.folders)}
        role="group"
        aria-label={t('intro.import.plan.folders')}
        data-import-bot-sessions=""
      >
        {folders.map((folder) => {
          const picked = folder.sessionIds.filter((id) => chosen.has(id)).length;
          const all = picked === folder.sessionIds.length;
          const shown = open.has(folder.path);
          return (
            <div
              key={folder.path}
              {...stylex.props(styles.folder)}
              data-import-folder={folder.path}
            >
              <div {...stylex.props(styles.bar)}>
                <Checkbox
                  checked={all}
                  indeterminate={picked > 0 && !all}
                  title={folder.path}
                  label={folder.name}
                  onChange={(on) => pick(draft, folder.sessionIds, on)}
                />
                <span {...stylex.props(styles.meta)}>
                  {t('intro.import.plan.picked', {
                    selected: picked,
                    total: folder.sessionIds.length,
                  })}
                </span>
                <span {...stylex.props(styles.grow)} />
                <IconButton
                  size="inline"
                  aria-label={t(shown ? 'intro.import.plan.hide' : 'intro.import.plan.show', {
                    name: folder.name,
                  })}
                  aria-expanded={shown}
                  data-import-folder-toggle={folder.path}
                  onClick={() =>
                    setOpen((current) => {
                      const next = new Set(current);
                      if (shown) next.delete(folder.path);
                      else next.add(folder.path);
                      return next;
                    })
                  }
                >
                  <Icon name={shown ? 'chevron-down' : 'chevron-right'} />
                </IconButton>
              </div>
              {shown ? (
                <div {...stylex.props(styles.sessions)}>
                  {folder.sessionIds.map((id) => {
                    const row = byId.get(id);
                    if (row === undefined) return null;
                    return (
                      <div key={id} {...stylex.props(styles.session)} data-import-session={id}>
                        <Checkbox
                          checked={chosen.has(id)}
                          label={row.title ?? t('bot.create.sessions.untitled')}
                          onChange={(on) => pick(draft, [id], on)}
                        />
                        <span {...stylex.props(styles.meta, styles.indent)}>
                          {sessionSummary(row, now, t)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div {...stylex.props(stepStyles.section)} data-intro-import-plan="">
      <div>
        <h3 {...stylex.props(stepStyles.sectionTitle)}>{t('intro.import.plan.title')}</h3>
        <p {...stylex.props(stepStyles.copy)}>{t('intro.import.plan.hint')}</p>
      </div>
      <ListCard label={t('intro.import.plan.title')}>
        {drafts.map((draft) => {
          const done = created.has(draft.id);
          const locked = done || busy;
          const bad = draft.sessionIds.length === 0 || draft.sessionIds.length > SESSION_BOT_MAX;
          return (
            <ListCardItem
              key={draft.id}
              data={{
                'data-import-bot': draft.name,
                'data-import-bot-created': done ? '' : undefined,
              }}
              leading={
                done ? (
                  <span {...stylex.props(styles.done)} title={t('intro.import.plan.created')}>
                    <Icon name="check" />
                  </span>
                ) : undefined
              }
              title={
                <Input
                  aria-label={t('intro.import.plan.name')}
                  placeholder={t('intro.import.plan.namePlaceholder')}
                  value={draft.name}
                  disabled={locked}
                  className={stylex.props(styles.name).className}
                  onChange={(event) => update(draft.id, { name: event.currentTarget.value })}
                />
              }
              summary={
                <span {...stylex.props(styles.summary, !done && bad && styles.warn)}>
                  {done ? t('intro.import.plan.created') : describe(draft)}
                </span>
              }
              trailing={
                done ? undefined : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      aria-expanded={editing === draft.id}
                      data-import-bot-edit=""
                      onClick={() => setEditing(editing === draft.id ? undefined : draft.id)}
                    >
                      {t(
                        editing === draft.id
                          ? 'intro.import.plan.editDone'
                          : 'intro.import.plan.edit',
                      )}
                    </Button>
                    <IconButton
                      aria-label={t('intro.import.plan.remove', {
                        name: draft.name.trim() || t('intro.import.plan.namePlaceholder'),
                      })}
                      disabled={busy}
                      data-import-bot-remove=""
                      onClick={() => {
                        setDrafts((current) => current.filter((other) => other.id !== draft.id));
                        if (editing === draft.id) setEditing(undefined);
                      }}
                    >
                      <Icon name="x" />
                    </IconButton>
                  </>
                )
              }
              detail={editing === draft.id && !done ? editor(draft) : undefined}
            />
          );
        })}
      </ListCard>
      <div {...stylex.props(styles.bar)}>
        <Button
          variant="outline"
          size="sm"
          icon={<Icon name="plus" />}
          disabled={busy}
          data-import-bot-add=""
          onClick={() => {
            const id = draftId();
            setDrafts((current) => [...current, { id, name: '', sessionIds: [] }]);
            setEditing(id);
          }}
        >
          {t('intro.import.plan.add')}
        </Button>
        <span {...stylex.props(styles.grow)} />
        <Button
          variant="primary"
          disabled={!ready || busy}
          data-intro-import-create=""
          onClick={() => void create()}
        >
          {busy
            ? t('intro.import.plan.creating')
            : t('intro.import.plan.create', { count: pending.length })}
        </Button>
      </div>
      {cause === undefined ? null : (
        <div role="status" data-intro-import-create-failed="">
          <ReadFailure
            retryLabel={t('intro.import.plan.retry')}
            busy={busy}
            onRetry={() => void create()}
          >
            {t('intro.import.plan.failed', { error: personaBotCreateError(cause, t) })}
          </ReadFailure>
        </div>
      )}
    </div>
  );
}
