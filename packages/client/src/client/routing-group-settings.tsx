import { routingGroupEngineLabel } from '@botharness/host-client/model-catalog';
import * as stylex from '@stylexjs/stylex';
import { useState, type ReactElement } from 'react';

import type { BridgeActions } from './actions.js';
import {
  errorMessage,
  type ModelCatalogEntryView,
  type RestingRouteView,
  type RoutingGroupMemberView,
  type RoutingGroupView,
} from './bridge.js';
import { Combobox, type ComboboxOption } from './combobox.js';
import { Button } from './ds/button.js';
import { FieldStack, TextField } from './ds/field.js';
import { ConfirmDialog, DangerTextButton, FormDialog } from './ds/form-dialog.js';
import { Icon } from './ds/icon.js';
import { IconButton } from './ds/icon-button.js';
import { Note } from './ds/note.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { font } from './ds/tobs.stylex.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

type GroupActions = Pick<
  BridgeActions,
  | 'modelCatalog'
  | 'routingGroups'
  | 'createRoutingGroup'
  | 'updateRoutingGroup'
  | 'deleteRoutingGroup'
>;

interface Library {
  groups: RoutingGroupView[];
  rests: RestingRouteView[];
  models: ModelCatalogEntryView[];
}

type Editor =
  | { mode: 'create'; name: string; members: RoutingGroupMemberView[] }
  | { mode: 'edit'; group: RoutingGroupView; name: string; members: RoutingGroupMemberView[] };

const styles = stylex.create({
  chain: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.x2,
    minWidth: 0,
  },
  members: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  member: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minWidth: 0,
    paddingBlock: space.x2,
    paddingInline: space.x3,
    borderRadius: radius.md,
    backgroundColor: color.well,
  },
  order: {
    flex: 'none',
    minWidth: space.x5,
    color: color.subtle,
    fontSize: text.metaSize,
    fontVariantNumeric: 'tabular-nums',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0,
  },
  name: {
    overflow: 'hidden',
    color: color.fg,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  route: {
    overflow: 'hidden',
    color: color.muted,
    fontFamily: font.familyMono,
    fontSize: text.metaSize,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  tools: { display: 'flex', flex: 'none', alignItems: 'center', gap: space.x1 },
  badge: {
    display: 'inline-flex',
    flex: 'none',
    alignItems: 'center',
    paddingBlock: space.x1,
    paddingInline: space.x3,
    borderRadius: radius.sm,
    backgroundColor: color.well,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    whiteSpace: 'nowrap',
  },
  warning: { backgroundColor: color.warningSoft, color: color.fg },
});

function Badge({ children, warning = false }: { children: string; warning?: boolean }) {
  return <span {...stylex.props(styles.badge, warning && styles.warning)}>{children}</span>;
}

function memberKey(member: RoutingGroupMemberView): string {
  switch (member.kind) {
    case 'group':
      return `group:${member.id}`;
    case 'engine':
      return `engine:${JSON.stringify([member.engine, member.model ?? ''])}`;
    case 'model':
      return `model:${JSON.stringify([member.provider, member.model, member.reasoningEffort ?? ''])}`;
  }
}

const optionKey = (entry: ModelCatalogEntryView): string =>
  memberKey({ kind: 'model', provider: entry.provider, model: entry.model });

function restOf(
  member: RoutingGroupMemberView,
  rests: readonly RestingRouteView[],
): RestingRouteView | undefined {
  if (member.kind !== 'model') return undefined;
  return rests.find((rest) => rest.provider === member.provider && rest.model === member.model);
}

function restingLabel(rest: RestingRouteView, t: BotHarnessTranslate): string {
  return t('routingGroups.resting', {
    until: new Date(rest.until).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  });
}

function memberName(
  member: RoutingGroupMemberView,
  library: Library,
  t: BotHarnessTranslate,
): { name: string; route?: string } {
  if (member.kind === 'engine') return { name: routingGroupEngineLabel(member) };
  if (member.kind === 'group')
    return {
      name:
        library.groups.find((group) => group.id === member.id)?.name ??
        t('routingGroups.missingGroup'),
    };
  const entry = library.models.find(
    (model) => model.provider === member.provider && model.model === member.model,
  );
  return {
    name: entry?.modelName ?? member.model,
    route: `${member.provider}/${member.model}${member.reasoningEffort ? ` · ${member.reasoningEffort}` : ''}`,
  };
}

async function loadLibrary(actions: GroupActions): Promise<Library> {
  const [groups, catalog] = await Promise.all([actions.routingGroups(), actions.modelCatalog()]);
  return { ...groups, models: catalog.models };
}

function MemberChain({
  group,
  library,
  t,
}: {
  group: RoutingGroupView;
  library: Library;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <span {...stylex.props(styles.chain)}>
      {group.members.map((member, index) => {
        const rest = restOf(member, library.rests);
        return (
          <span key={`${memberKey(member)}-${index}`} {...stylex.props(styles.chain)}>
            {index === 0 ? null : <span aria-hidden="true">→</span>}
            <span>{memberName(member, library, t).name}</span>
            {member.kind === 'group' ? <Badge>{t('routingGroups.groupTag')}</Badge> : null}
            {rest === undefined ? null : <Badge warning>{restingLabel(rest, t)}</Badge>}
          </span>
        );
      })}
    </span>
  );
}

function MemberEditor({
  editor,
  library,
  onChange,
  t,
}: {
  editor: Editor;
  library: Library;
  onChange(members: RoutingGroupMemberView[]): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const members = editor.members;
  const taken = new Set(members.map(memberKey));
  const selfId = editor.mode === 'edit' ? editor.group.id : undefined;
  const options: ComboboxOption[] = [
    ...library.models
      .filter((entry) => !taken.has(optionKey(entry)))
      .map((entry) => ({
        value: optionKey(entry),
        label: entry.modelName,
        hint: entry.providerName,
      })),
    ...library.groups
      .filter((group) => group.id !== selfId && !taken.has(`group:${group.id}`))
      .map((group) => ({
        value: `group:${group.id}`,
        label: group.name,
        hint: t('routingGroups.groupTag'),
      })),
  ];
  const move = (index: number, by: number): void => {
    const next = [...members];
    const [member] = next.splice(index, 1);
    next.splice(index + by, 0, member!);
    onChange(next);
  };
  return (
    <>
      {members.length === 0 ? (
        <Note>{t('routingGroups.noMembers')}</Note>
      ) : (
        <ol {...stylex.props(styles.members)} aria-label={t('routingGroups.members')}>
          {members.map((member, index) => {
            const { name, route } = memberName(member, library, t);
            const rest = restOf(member, library.rests);
            return (
              <li
                key={memberKey(member)}
                {...stylex.props(styles.member)}
                data-routing-group-member={memberKey(member)}
              >
                <span {...stylex.props(styles.order)}>{index + 1}</span>
                <span {...stylex.props(styles.label)}>
                  <span {...stylex.props(styles.name)}>{name}</span>
                  {route === undefined ? null : (
                    <span {...stylex.props(styles.route)}>{route}</span>
                  )}
                </span>
                {member.kind === 'group' ? <Badge>{t('routingGroups.groupTag')}</Badge> : null}
                {rest === undefined ? null : <Badge warning>{restingLabel(rest, t)}</Badge>}
                <span {...stylex.props(styles.tools)}>
                  <IconButton
                    size="inline"
                    tone="subtle"
                    aria-label={t('routingGroups.moveUp', { name })}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <Icon name="chevron-up" />
                  </IconButton>
                  <IconButton
                    size="inline"
                    tone="subtle"
                    aria-label={t('routingGroups.moveDown', { name })}
                    disabled={index === members.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <Icon name="chevron-down" />
                  </IconButton>
                  <IconButton
                    size="inline"
                    tone="subtle"
                    aria-label={t('routingGroups.remove', { name })}
                    onClick={() => onChange(members.filter((_, at) => at !== index))}
                  >
                    <Icon name="trash" />
                  </IconButton>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <Combobox
        value=""
        options={options}
        onSelect={(key) => {
          if (key.startsWith('group:')) {
            onChange([...members, { kind: 'group', id: key.slice('group:'.length) }]);
            return;
          }
          const entry = library.models.find((model) => optionKey(model) === key);
          if (entry !== undefined)
            onChange([...members, { kind: 'model', provider: entry.provider, model: entry.model }]);
        }}
        label={t('routingGroups.add')}
        toggleLabel={t('modelPreset.showModels')}
        placeholder={t('routingGroups.add')}
        emptyLabel={t('modelPreset.noMatch')}
      />
    </>
  );
}

export function RoutingGroupSettings({
  actions,
  t,
}: {
  actions: GroupActions;
  t: BotHarnessTranslate;
}): ReactElement {
  const [library, setLibrary] = useState<Library>();
  const [loadError, setLoadError] = useState<string>();
  const [editor, setEditor] = useState<Editor>();
  const [deleting, setDeleting] = useState<RoutingGroupView>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const mount = useMountedResource<HTMLElement>(() => {
    let live = true;
    loadLibrary(actions)
      .then((next) => {
        if (live) setLibrary(next);
      })
      .catch((cause: unknown) => {
        if (live) setLoadError(errorMessage(cause));
      });
    return () => {
      live = false;
    };
  }, [actions]);
  const labels = { close: t('common.close'), cancel: t('common.cancel') };
  const close = (): void => {
    setEditor(undefined);
    setDeleting(undefined);
    setError(undefined);
  };
  const run = (operation: () => Promise<unknown>): void => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    void operation()
      .then(async () => {
        close();
        setLibrary(await loadLibrary(actions));
      })
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };

  const dialog = (() => {
    if (library === undefined) return null;
    if (deleting !== undefined)
      return (
        <ConfirmDialog
          title={t('routingGroups.deleteTitle', { name: deleting.name })}
          labels={labels}
          confirmLabel={t('routingGroups.delete')}
          busy={busy}
          error={error}
          onCancel={() => {
            setDeleting(undefined);
            setError(undefined);
          }}
          onConfirm={() => run(() => actions.deleteRoutingGroup(deleting.id, deleting.revision))}
        />
      );
    if (editor === undefined) return null;
    const name = editor.name.trim();
    const unchanged =
      editor.mode === 'edit' &&
      name === editor.group.name &&
      JSON.stringify(editor.members) === JSON.stringify(editor.group.members);
    return (
      <FormDialog
        title={
          editor.mode === 'create'
            ? t('routingGroups.createTitle')
            : t('routingGroups.editTitle', { name: editor.group.name })
        }
        size="medium"
        scroll
        labels={labels}
        submitLabel={editor.mode === 'create' ? t('routingGroups.create') : t('routingGroups.save')}
        submitData={{ 'data-routing-group-submit': editor.mode }}
        submitDisabled={name === '' || editor.members.length === 0 || unchanged}
        busy={busy}
        error={error}
        onCancel={close}
        secondary={
          editor.mode === 'edit' ? (
            <DangerTextButton
              onClick={() => {
                setError(undefined);
                setDeleting(editor.group);
                setEditor(undefined);
              }}
            >
              {t('routingGroups.delete')}
            </DangerTextButton>
          ) : undefined
        }
        onSubmit={() =>
          run(() =>
            editor.mode === 'create'
              ? actions.createRoutingGroup(name, editor.members)
              : actions.updateRoutingGroup(
                  editor.group.id,
                  editor.group.revision,
                  name,
                  editor.members,
                ),
          )
        }
      >
        <FieldStack>
          <TextField
            label={t('routingGroups.name')}
            value={editor.name}
            initialFocus={editor.mode === 'create'}
            onChange={(value) => setEditor({ ...editor, name: value })}
          />
          <MemberEditor
            editor={editor}
            library={library}
            onChange={(members) => setEditor({ ...editor, members })}
            t={t}
          />
        </FieldStack>
      </FormDialog>
    );
  })();

  return (
    <>
      <SettingsSection
        rootRef={mount}
        data={{ 'data-routing-group-settings': '' }}
        title={t('routingGroups.title')}
      >
        {loadError !== undefined ? (
          <Note tone="danger">{loadError}</Note>
        ) : library === undefined ? (
          <Note>{t('modelPreset.loading')}</Note>
        ) : (
          <>
            <SettingsRow
              title={t('routingGroups.new')}
              description={library.groups.length === 0 ? t('routingGroups.empty') : undefined}
              data={{ 'data-routing-group-new': '' }}
              control={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setError(undefined);
                    setEditor({ mode: 'create', name: '', members: [] });
                  }}
                >
                  {t('routingGroups.create')}
                </Button>
              }
            />
            {library.groups.map((group) => (
              <SettingsRow
                key={group.id}
                title={group.name}
                data={{ 'data-routing-group': group.id }}
                description={<MemberChain group={group} library={library} t={t} />}
                control={
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={t('routingGroups.editTitle', { name: group.name })}
                    onClick={() => {
                      setError(undefined);
                      setEditor({
                        mode: 'edit',
                        group,
                        name: group.name,
                        members: group.members,
                      });
                    }}
                  >
                    {t('routingGroups.edit')}
                  </Button>
                }
              />
            ))}
          </>
        )}
      </SettingsSection>
      {dialog}
    </>
  );
}
