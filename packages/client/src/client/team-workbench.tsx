import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import type { BridgeCall } from './bridge.js';
import type { DockPanel } from './dock-panels.js';
import { Button } from './ds/button.js';
import { Icon } from './ds/icon.js';
import { NavGroupHeading, NavItem } from './ds/nav-item.js';
import { Note } from './ds/note.js';
import { SegmentedControl } from './ds/segmented.js';
import { Tag } from './ds/tag.js';
import { dimension } from './ds/dimensions.stylex.js';
import { ink, layer, radius, size, space, style, type } from './ds/tobs.stylex.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { loadMembers, loadTeamMode, type TeamMember, type TeamModeView } from './team-bridge.js';
import {
  MANAGE_MEMBERS,
  MANAGE_ROLES,
  canGrant,
  canManage,
  hasConflict,
  loadMemberPermissions,
  loadPermissionCatalog,
  loadRoles,
  updateRole,
  type MemberPermissions,
  type PermissionSource,
  type PermissionEntry,
  type TeamRole,
} from './team-roles-bridge.js';
import { permissionLabel, roleLabel } from './team-roles.js';
import { teamErrorText } from './team-settings.js';

export const TEAM_WORKBENCH_PANEL = 'team-workbench';

export type PermissionChoice = 'allow' | 'unset' | 'deny';

export const WORKBENCH_GROUPS: readonly (readonly [string, readonly string[]])[] = [
  ['membersRoles', ['members.manage', 'roles.manage', 'team.settings']],
  ['create', ['bots.createPrivate', 'bots.createPublic', 'channels.create']],
  ['manage', ['bots.manageAll', 'channels.manageAll', 'bots.manageGrants', 'im.bind']],
  [
    'compute',
    [
      'models.use',
      'models.configure',
      'modelSources.manage',
      'workspaces.manageShared',
      'workspaces.createFolder',
    ],
  ],
  ['communicate', ['dm.humans']],
  ['oversight', ['approvals.opaqueTools', 'usage.view', 'audit.view', 'privateContent.view']],
];

const HIGH_RISK: ReadonlySet<string> = new Set(['approvals.opaqueTools', 'privateContent.view']);
const OWNER_GRANTED: ReadonlySet<string> = new Set([
  'privateContent.view',
  'modelSources.manage',
  'bots.manageGrants',
]);

export function groupCatalog(
  catalog: readonly PermissionEntry[],
): readonly (readonly [string, readonly string[]])[] {
  const known = new Set(catalog.map((entry) => entry.id));
  const listed = new Set(WORKBENCH_GROUPS.flatMap(([, ids]) => ids));
  const groups = WORKBENCH_GROUPS.map(
    ([group, ids]) => [group, ids.filter((id) => known.has(id))] as const,
  );
  const other = catalog.map((entry) => entry.id).filter((id) => !listed.has(id));
  return [...groups, ['other', other] as const].filter(([, ids]) => ids.length > 0);
}

export function choiceOf(role: TeamRole, id: string): PermissionChoice {
  return role.denied.includes(id) ? 'deny' : role.permissions.includes(id) ? 'allow' : 'unset';
}

export function withChoice(
  role: TeamRole,
  id: string,
  choice: PermissionChoice,
): { permissions: string[]; denied: string[] } {
  const permissions = role.permissions.filter((item) => item !== id);
  const denied = role.denied.filter((item) => item !== id);
  if (choice === 'allow') permissions.push(id);
  if (choice === 'deny') denied.push(id);
  return { permissions, denied };
}

const styles = stylex.create({
  root: {
    display: 'grid',
    gridTemplateColumns: `${dimension.workbenchNavWidth} ${dimension.workbenchListWidth} minmax(0, 1fr)`,
    gap: space.x3,
    height: '100%',
    minHeight: 0,
    boxSizing: 'border-box',
    padding: space.x3,
    backgroundColor: layer.canvas,
    color: ink.primary,
    fontSize: type.bodySize,
    lineHeight: type.bodyLine,
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    minHeight: 0,
    minWidth: 0,
    overflowY: 'auto',
    padding: space.x3,
    borderRadius: radius.lg,
    backgroundColor: layer.raised,
  },
  title: {
    margin: 0,
    paddingBlock: space.x3,
    paddingInline: space.x3,
    fontSize: type.titleSize,
    lineHeight: type.titleLine,
    fontWeight: type.titleWeight,
  },
  detail: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x4,
    minHeight: 0,
    minWidth: 0,
    overflowY: 'auto',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x4,
    padding: space.x5,
    borderRadius: radius.lg,
    backgroundColor: layer.raised,
  },
  headIcon: {
    display: 'grid',
    placeItems: 'center',
    width: size.rowMedium,
    height: size.rowMedium,
    flexShrink: 0,
    borderRadius: radius.md,
    backgroundColor: layer.well,
    color: ink.secondary,
  },
  headText: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  heading: {
    margin: 0,
    fontSize: type.headingSize,
    lineHeight: type.headingLine,
    fontWeight: type.headingWeight,
  },
  meta: {
    margin: 0,
    color: ink.secondary,
    fontSize: type.captionSize,
    lineHeight: type.captionLine,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    paddingBlock: space.x3,
    borderRadius: radius.lg,
    backgroundColor: layer.raised,
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.x3,
    paddingBlock: space.x2,
    paddingInline: space.x5,
  },
  cardTitle: {
    margin: 0,
    fontSize: type.titleSize,
    lineHeight: type.titleLine,
    fontWeight: type.titleWeight,
  },
  cardAside: {
    flexGrow: 1,
    textAlign: 'end',
    color: ink.secondary,
    fontSize: type.captionSize,
    lineHeight: type.captionLine,
  },
  group: {
    margin: 0,
    paddingBlockStart: space.x4,
    paddingBlockEnd: space.x2,
    paddingInline: space.x5,
    color: ink.secondary,
    fontSize: type.captionSize,
    lineHeight: type.captionLine,
    fontWeight: type.labelWeight,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.x4,
    minHeight: style.rowList,
    paddingBlock: space.x3,
    paddingInline: space.x5,
  },
  rowText: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0,
  },
  rowTitle: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.x3,
  },
  hint: {
    color: ink.secondary,
    fontSize: type.captionSize,
    lineHeight: type.captionLine,
  },
  sources: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.x2,
    justifyContent: 'flex-end',
  },
  members: {
    display: 'flex',
    flexDirection: 'column',
    paddingInline: space.x3,
  },
  empty: {
    margin: 0,
    paddingBlock: space.x3,
    paddingInline: space.x5,
    color: ink.secondary,
  },
});

function maybe(t: BotHarnessTranslate, key: string): string | undefined {
  const value = t(key as BotHarnessKey);
  return value === key ? undefined : value;
}

function sourceName(t: BotHarnessTranslate, source: PermissionSource): string {
  if (source.builtin === 'admin') return t('team.role.admin');
  if (source.builtin === 'member') return t('team.role.member');
  return source.name;
}

function groupTitle(t: BotHarnessTranslate, group: string): string {
  return t(`team.workbench.group.${group}` as BotHarnessKey);
}

function lockReason(
  t: BotHarnessTranslate,
  view: TeamModeView,
  role: TeamRole,
  id: string,
): string | undefined {
  if (!canManage(view.viewer, MANAGE_ROLES)) return t('team.workbench.readOnly');
  if (role.builtin === 'admin' && OWNER_GRANTED.has(id)) return t('team.workbench.adminExcluded');
  if (!view.viewer.owner && OWNER_GRANTED.has(id)) return t('team.workbench.ownerOnly');
  if (!canGrant(view.viewer, id)) return t('team.workbench.notHeld');
  return undefined;
}

function CapabilityChoice({
  t,
  view,
  role,
  id,
  busy,
  onChange,
}: {
  t: BotHarnessTranslate;
  view: TeamModeView;
  role: TeamRole;
  id: string;
  busy: boolean;
  onChange(choice: PermissionChoice): void;
}): ReactElement {
  const label = permissionLabel(t, id);
  const locked = lockReason(t, view, role, id);
  const hint = locked ?? maybe(t, `team.permission.${id}.hint`);
  return (
    <div {...stylex.props(styles.row)} data-team-capability={id}>
      <div {...stylex.props(styles.rowText)}>
        <span {...stylex.props(styles.rowTitle)}>
          {label}
          {HIGH_RISK.has(id) ? <Tag tone="warning">{t('team.workbench.risk')}</Tag> : null}
        </span>
        {hint === undefined ? null : <span {...stylex.props(styles.hint)}>{hint}</span>}
      </div>
      <SegmentedControl<PermissionChoice>
        id={`team-capability-${role.roleId}-${id}`}
        label={label}
        value={choiceOf(role, id)}
        disabled={busy || locked !== undefined}
        options={[
          { value: 'allow', label: t('team.workbench.allow') },
          { value: 'unset', label: t('team.workbench.unset') },
          { value: 'deny', label: t('team.workbench.deny') },
        ]}
        onChange={onChange}
      />
    </div>
  );
}

function EffectivePermissions({
  t,
  catalog,
  member,
  result,
}: {
  t: BotHarnessTranslate;
  catalog: readonly PermissionEntry[];
  member: TeamMember;
  result: MemberPermissions;
}): ReactElement {
  const byId = new Map(result.permissions.map((entry) => [entry.id, entry]));
  return (
    <section {...stylex.props(styles.card)} data-team-effective={member.username}>
      <div {...stylex.props(styles.cardHead)}>
        <h3 {...stylex.props(styles.cardTitle)}>
          {t('team.workbench.effective', { name: member.displayName })}
        </h3>
        <span {...stylex.props(styles.cardAside)}>{t('team.workbench.denyWins')}</span>
      </div>
      {result.owner ? <p {...stylex.props(styles.empty)}>{t('team.owner.noRoles')}</p> : null}
      {result.owner
        ? null
        : groupCatalog(catalog).map(([group, ids]) => (
            <div key={group}>
              <p {...stylex.props(styles.group)}>{groupTitle(t, group)}</p>
              {ids.map((id) => {
                const entry = byId.get(id);
                if (entry === undefined) return null;
                return (
                  <div
                    key={id}
                    {...stylex.props(styles.row)}
                    data-team-effective-permission={id}
                    data-state={entry.state}
                  >
                    <span {...stylex.props(styles.rowText)}>{permissionLabel(t, id)}</span>
                    <span {...stylex.props(styles.sources)}>
                      {hasConflict(entry) ? (
                        <Tag tone="warning">{t('team.workbench.conflict')}</Tag>
                      ) : null}
                      {entry.sources.map((source) => (
                        <Tag
                          key={source.roleId}
                          tone={source.effect === 'deny' ? 'danger' : 'neutral'}
                        >
                          {t(
                            source.effect === 'deny'
                              ? 'team.workbench.sourceDeny'
                              : 'team.workbench.sourceAllow',
                            { role: sourceName(t, source) },
                          )}
                        </Tag>
                      ))}
                      <Tag tone={entry.state === 'granted' ? 'success' : 'neutral'}>
                        {t(`team.workbench.state.${entry.state}` as BotHarnessKey)}
                      </Tag>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
    </section>
  );
}

function roleIcon(role: TeamRole): string {
  return role.builtin === 'admin' ? 'shield-check' : 'users';
}

export function TeamWorkbench({
  call,
  t,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
}): ReactElement {
  const [view, setView] = useState<TeamModeView>();
  const [roles, setRoles] = useState<readonly TeamRole[]>([]);
  const [catalog, setCatalog] = useState<readonly PermissionEntry[]>([]);
  const [members, setMembers] = useState<readonly TeamMember[]>([]);
  const [selected, setSelected] = useState<string>();
  const [inspected, setInspected] = useState<{
    member: TeamMember;
    result: MemberPermissions;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const inspection = useRef(0);
  const inspecting = useRef<TeamMember | undefined>(undefined);

  const refresh = async (signal?: AbortSignal): Promise<void> => {
    try {
      const next = await loadTeamMode(call, signal);
      const admin = canManage(next.viewer, MANAGE_ROLES) || canManage(next.viewer, MANAGE_MEMBERS);
      const [roleList, permissions, people] = admin
        ? await Promise.all([
            loadRoles(call, signal),
            loadPermissionCatalog(call, signal),
            canManage(next.viewer, MANAGE_MEMBERS)
              ? loadMembers(call, signal)
              : Promise.resolve<TeamMember[]>([]),
          ])
        : [[], [], []];
      if (signal?.aborted === true) return;
      setView(next);
      setRoles(roleList);
      setCatalog(permissions);
      setMembers(people);
      setLoadFailed(false);
    } catch {
      if (signal?.aborted !== true) setLoadFailed(true);
    }
  };

  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [call]);

  const role = roles.find((item) => item.roleId === selected) ?? roles[0];
  const holders =
    role === undefined ? [] : members.filter((member) => member.roleIds.includes(role.roleId));

  const choose = async (target: TeamRole, id: string, choice: PermissionChoice): Promise<void> => {
    const request = inspection.current;
    setBusy(true);
    setError(undefined);
    try {
      const updated = await updateRole(call, {
        roleId: target.roleId,
        ...withChoice(target, id, choice),
      });
      setRoles((current) =>
        current.map((item) => (item.roleId === updated.roleId ? updated : item)),
      );
      const member = inspecting.current;
      if (member !== undefined && request === inspection.current) {
        const reload = ++inspection.current;
        const result = await loadMemberPermissions(call, member.humanId);
        if (reload === inspection.current) setInspected({ member, result });
      }
    } catch (failure) {
      setError(teamErrorText(t, failure));
    } finally {
      setBusy(false);
    }
  };

  const clearInspection = (): void => {
    inspection.current++;
    inspecting.current = undefined;
    setInspected(undefined);
  };

  const inspect = async (member: TeamMember): Promise<void> => {
    const request = ++inspection.current;
    inspecting.current = member;
    setError(undefined);
    try {
      const result = await loadMemberPermissions(call, member.humanId);
      if (request === inspection.current) setInspected({ member, result });
    } catch (failure) {
      if (request === inspection.current) setError(teamErrorText(t, failure));
    }
  };

  const retry = async (): Promise<void> => {
    setRetrying(true);
    await refresh();
    setRetrying(false);
  };

  const nav = (
    <nav {...stylex.props(styles.column)} aria-label={t('team.workbench.title')}>
      <h2 {...stylex.props(styles.title)}>{t('team.workbench.title')}</h2>
      <NavGroupHeading first label={t('team.workbench.section.permissions')} />
      <NavItem
        icon={<Icon name="id-card" />}
        label={t('team.workbench.internalRoles')}
        current
        trailing={String(roles.length)}
        data={{ 'data-team-nav': 'roles' }}
        onSelect={clearInspection}
      />
    </nav>
  );

  if (view === undefined || !canManage(view.viewer, MANAGE_ROLES))
    return (
      <div ref={mount} {...stylex.props(styles.root)} data-team-workbench="">
        {nav}
        <div {...stylex.props(styles.column)}>
          {loadFailed ? (
            <Note tone="danger">
              {t('team.error.load')}
              <Button
                size="sm"
                variant="outline"
                disabled={retrying}
                data-team-retry=""
                onClick={() => void retry()}
              >
                {t('team.workbench.retry')}
              </Button>
            </Note>
          ) : null}
          {view !== undefined ? <Note>{t('team.workbench.noAccess')}</Note> : null}
        </div>
      </div>
    );

  return (
    <div ref={mount} {...stylex.props(styles.root)} data-team-workbench="">
      {nav}
      <div
        {...stylex.props(styles.column)}
        role="list"
        aria-label={t('team.workbench.internalRoles')}
      >
        {roles.map((item) => (
          <div role="listitem" key={item.roleId}>
            <NavItem
              icon={<Icon name={roleIcon(item)} />}
              label={roleLabel(t, item)}
              description={t('team.workbench.roleSummary', {
                people: item.memberCount,
                allow: item.permissions.length,
                deny: item.denied.length,
              })}
              multiline
              current={item.roleId === role?.roleId}
              data={{ 'data-team-role': item.roleId }}
              onSelect={() => {
                setSelected(item.roleId);
                clearInspection();
              }}
            />
          </div>
        ))}
      </div>
      {role === undefined ? (
        <div {...stylex.props(styles.column)} />
      ) : (
        <div {...stylex.props(styles.detail)} data-team-role-detail={role.roleId}>
          <header {...stylex.props(styles.head)}>
            <span {...stylex.props(styles.headIcon)} aria-hidden="true">
              <Icon name={roleIcon(role)} large />
            </span>
            <div {...stylex.props(styles.headText)}>
              <h2 {...stylex.props(styles.heading)}>{roleLabel(t, role)}</h2>
              <p {...stylex.props(styles.meta)}>
                {t('team.workbench.people', { people: role.memberCount })}
              </p>
            </div>
          </header>
          {error === undefined ? null : <Note tone="danger">{error}</Note>}
          <section {...stylex.props(styles.card)}>
            <div {...stylex.props(styles.cardHead)}>
              <h3 {...stylex.props(styles.cardTitle)}>{t('team.workbench.capabilities')}</h3>
              <Tag tone="info">{t('team.workbench.enforced')}</Tag>
              <span {...stylex.props(styles.cardAside)}>{t('team.workbench.denyWins')}</span>
            </div>
            {groupCatalog(catalog).map(([group, ids]) => (
              <div key={group} data-team-capability-group={group}>
                <p {...stylex.props(styles.group)}>{groupTitle(t, group)}</p>
                {ids.map((id) => (
                  <CapabilityChoice
                    key={id}
                    t={t}
                    view={view}
                    role={role}
                    id={id}
                    busy={busy}
                    onChange={(choice) => void choose(role, id, choice)}
                  />
                ))}
              </div>
            ))}
          </section>
          {canManage(view.viewer, MANAGE_MEMBERS) ? (
            <section {...stylex.props(styles.card)}>
              <div {...stylex.props(styles.cardHead)}>
                <h3 {...stylex.props(styles.cardTitle)}>{t('team.workbench.holders')}</h3>
              </div>
              {holders.length === 0 ? (
                <p {...stylex.props(styles.empty)}>{t('team.workbench.noHolders')}</p>
              ) : (
                <div {...stylex.props(styles.members)} role="list">
                  {holders.map((member) => (
                    <div role="listitem" key={member.humanId}>
                      <NavItem
                        icon={<Icon name="user" />}
                        label={member.displayName}
                        description={member.username}
                        multiline
                        current={inspected?.member.humanId === member.humanId}
                        trailing={t('team.workbench.inspect')}
                        data={{ 'data-team-holder': member.username }}
                        onSelect={() => void inspect(member)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}
          {inspected === undefined ? null : (
            <EffectivePermissions
              t={t}
              catalog={catalog}
              member={inspected.member}
              result={inspected.result}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function createTeamWorkbenchPanel(call: BridgeCall, t: BotHarnessTranslate): DockPanel {
  return {
    id: TEAM_WORKBENCH_PANEL,
    title: t('team.workbench.title'),
    icon: 'users',
    scope: 'global',
    order: 400,
    presentation: 'workbench',
    defaultPosition: { zone: 'center' },
    component: () => <TeamWorkbench call={call} t={t} />,
  };
}
