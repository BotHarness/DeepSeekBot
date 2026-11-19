import {
  routingGroupEngineMemberRow,
  routingGroupEnginePresentation,
} from '@botharness/host-client/model-catalog';
import type { RoutingGroupEngineOptions } from '@botharness/host-protocol/subscription-engine';
import * as stylex from '@stylexjs/stylex';
import { useState, type ReactElement } from 'react';

import type { BridgeActions } from './actions.js';
import {
  errorMessage,
  type ModelCatalogEntryView,
  type ModelCatalogGroupView,
  type RestingRouteView,
  type RoutingGroupMemberView,
  type RoutingGroupView,
} from './bridge.js';
import { Button } from './ds/button.js';
import { FieldStack, TextField } from './ds/field.js';
import { ConfirmDialog, DangerTextButton, FormDialog } from './ds/form-dialog.js';
import { Icon } from './ds/icon.js';
import { IconButton } from './ds/icon-button.js';
import { Note } from './ds/note.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { modelBrand, ModelBrandIcon, modelShortName, type ModelBrand } from './model-brand.js';
import { routingGroupEngineCopy } from './model-menu.js';
import { ENGINE_MARKER_ICON, routingGroupEngineReason } from './session-engine.js';
import { useMountedResource } from './mounted-resource.js';
import { RoutingGroupMemberPicker, routingGroupMemberKey } from './routing-group-member-picker.js';

type GroupActions = Pick<
  BridgeActions,
  | 'modelCatalog'
  | 'routingGroups'
  | 'routingGroupEngines'
  | 'createRoutingGroup'
  | 'updateRoutingGroup'
  | 'deleteRoutingGroup'
>;

interface Library {
  groups: RoutingGroupView[];
  catalogGroups: ModelCatalogGroupView[];
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
  editorFields: { display: 'flex', flexDirection: 'column', gap: space.x4, minWidth: 0 },
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
  unavailable: { color: color.muted },
  route: {
    overflow: 'hidden',
    color: color.muted,
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
): { name: string; title: string; detail?: string; brand?: ModelBrand | undefined } {
  if (member.kind === 'engine')
    return routingGroupEnginePresentation(member, routingGroupEngineCopy(t));
  if (member.kind === 'group') {
    const name =
      library.groups.find((group) => group.id === member.id)?.name ??
      t('routingGroups.missingGroup');
    return { name, title: name };
  }
  const entry = library.models.find(
    (model) => model.provider === member.provider && model.model === member.model,
  );
  const name = entry?.modelName ?? member.model;
  const brand = modelBrand({ ...member, name });
  return {
    name,
    title: modelShortName(name, brand),
    brand,
    detail: [entry?.providerName ?? member.provider, member.reasoningEffort]
      .filter(Boolean)
      .join(' · '),
  };
}

async function loadLibrary(actions: GroupActions): Promise<Library> {
  const [groups, catalog] = await Promise.all([actions.routingGroups(), actions.modelCatalog()]);
  return { ...groups, models: catalog.models, catalogGroups: catalog.groups ?? [] };
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
        const row = memberName(member, library, t);
        return (
          <span key={`${routingGroupMemberKey(member)}-${index}`} {...stylex.props(styles.chain)}>
            {index === 0 ? null : <span aria-hidden="true">→</span>}
            {member.kind === 'engine' ? (
              <>
                <ModelBrandIcon brand={row.brand} size={16} />
                <span {...stylex.props(styles.label)}>
                  <span>{row.title}</span>
                  <span {...stylex.props(styles.route)}>{row.detail}</span>
                </span>
                <Icon name={ENGINE_MARKER_ICON} size={12} />
              </>
            ) : (
              <span>{row.name}</span>
            )}
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
  loadEngines,
  onChange,
  t,
}: {
  editor: Editor;
  library: Library;
  loadEngines: GroupActions['routingGroupEngines'];
  onChange(members: RoutingGroupMemberView[]): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const members = editor.members;
  const [engines, setEngines] = useState<RoutingGroupEngineOptions[]>();
  const [engineReadFailed, setEngineReadFailed] = useState(false);
  const [engineRead, setEngineRead] = useState(() =>
    members.some((member) => member.kind === 'engine') ? 1 : 0,
  );
  const refreshEngines = () => {
    setEngineReadFailed(false);
    setEngineRead((read) => read + 1);
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    if (engineRead === 0) return;
    let active = true;
    void loadEngines().then(
      (options) => {
        if (!active) return;
        setEngines(options);
        setEngineReadFailed(false);
      },
      () => {
        if (active) setEngineReadFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [engineRead, loadEngines]);
  const move = (index: number, by: number): void => {
    const next = [...members];
    const [member] = next.splice(index, 1);
    next.splice(index + by, 0, member!);
    onChange(next);
  };
  return (
    <div ref={mount} {...stylex.props(styles.editorFields)}>
      {members.length === 0 ? (
        <Note>{t('routingGroups.noMembers')}</Note>
      ) : (
        <ol {...stylex.props(styles.members)} aria-label={t('routingGroups.members')}>
          {members.map((member, index) => {
            const engine =
              member.kind === 'engine'
                ? engines?.find((option) => option.engine === member.engine)
                : undefined;
            const engineRow =
              member.kind === 'engine'
                ? routingGroupEngineMemberRow(member, engine, routingGroupEngineCopy(t))
                : undefined;
            const engineReason =
              engine?.available === false
                ? routingGroupEngineReason(engine.engine, engine.reason, t)
                : engineRow?.unavailable
                  ? t('routingGroups.engineModelUnavailable')
                  : undefined;
            const { name, title, detail, brand } = engineRow ?? memberName(member, library, t);
            const rest = restOf(member, library.rests);
            const unavailable = rest !== undefined || engineReason !== undefined;
            return (
              <li
                key={routingGroupMemberKey(member)}
                {...stylex.props(styles.member, unavailable && styles.unavailable)}
                data-routing-group-member={routingGroupMemberKey(member)}
              >
                <span {...stylex.props(styles.order)}>{index + 1}</span>
                {member.kind === 'group' ? (
                  <Icon name="git-branch" size={16} />
                ) : (
                  <ModelBrandIcon brand={brand} size={16} />
                )}
                <span {...stylex.props(styles.label)}>
                  <span {...stylex.props(styles.name, unavailable && styles.unavailable)}>
                    {title}
                  </span>
                  {detail === undefined ? null : (
                    <span {...stylex.props(styles.route)}>
                      {engineReason === undefined
                        ? detail
                        : `${detail} · ${t('routingGroups.unavailable')} · ${engineReason}`}
                    </span>
                  )}
                </span>
                {engineRow?.isDefault ? <Badge>{t('routingGroups.defaultTag')}</Badge> : null}
                {member.kind === 'engine' ? <Icon name={ENGINE_MARKER_ICON} size={12} /> : null}
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
      <RoutingGroupMemberPicker
        models={library.models}
        groups={library.catalogGroups}
        members={members}
        selfId={editor.mode === 'edit' ? editor.group.id : undefined}
        engines={engines}
        engineReadFailed={engineReadFailed}
        refreshEngines={refreshEngines}
        onSelect={(member) => onChange([...members, member])}
        t={t}
      />
    </div>
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
            loadEngines={actions.routingGroupEngines}
            onChange={(members) => {
              setError(undefined);
              setEditor({ ...editor, members });
            }}
            t={t}
          />
          {editor.members.length > 0 &&
          editor.members.every((member) => member.kind === 'engine') &&
          error === undefined ? (
            <Note>{t('routingGroups.requiresModel')}</Note>
          ) : null}
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
