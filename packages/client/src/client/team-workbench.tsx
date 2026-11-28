import { useRef, useState, type ReactElement, type ReactNode } from 'react';

import type { BridgeCall } from './bridge.js';
import type { DockPanel } from './dock-panels.js';
import { Button } from './ds/button.js';
import { Note } from './ds/note.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { STALE_HOST_ROLE } from '@botharness/host-client/team-roles';
import {
  loadMembers,
  loadTeamMode,
  teamRefusal,
  type TeamMember,
  type TeamModeView,
} from './team-bridge.js';
import {
  MANAGE_MEMBERS,
  MANAGE_ROLES,
  canManage,
  loadMemberPermissions,
  loadPermissionCatalog,
  loadRoles,
  updateRole,
  type PermissionEntry,
  type TeamRole,
} from './team-roles-bridge.js';
import { teamErrorText } from './team-settings.js';
import { BotsSection } from './team-workbench/bots-section.js';
import { ChannelsSection } from './team-workbench/channels-section.js';
import { ExternalRolesSection } from './team-workbench/external-roles-section.js';
import { DetailNotice, EmptyDetail, WorkbenchFrame } from './team-workbench/frame.js';
import { InternalMembersSection } from './team-workbench/internal-members-section.js';
import { withChoice, type PermissionChoice } from './team-workbench/permission-model.js';
import { RoleBotScope } from './team-workbench/role-bot-scope.js';
import { RoleConflictNote, type RoleConflict } from './team-workbench/role-conflict.js';
import { RolesSection, type Inspection } from './team-workbench/roles-section.js';
import { SectionNav } from './team-workbench/section-nav.js';
import {
  resolveSection,
  visibleSections,
  type TeamSectionContext,
  type TeamSectionId,
} from './team-workbench/sections.js';

export {
  WORKBENCH_GROUPS,
  choiceOf,
  groupCatalog,
  withChoice,
  type PermissionChoice,
} from './team-workbench/permission-model.js';

export const TEAM_WORKBENCH_PANEL = 'team-workbench';

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
  const [requested, setRequested] = useState<TeamSectionId>();
  const [selectedRole, setSelectedRole] = useState<string>();
  const [inspected, setInspected] = useState<Inspection>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState<RoleConflict>();
  const [inspectError, setInspectError] = useState<string>();
  const [pending, setPending] = useState<string>();
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

  const mount = useMountedResource<HTMLElement>(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [call]);

  const clearInspection = (): void => {
    inspection.current++;
    inspecting.current = undefined;
    setInspected(undefined);
    setInspectError(undefined);
    setPending(undefined);
  };

  const inspect = async (member: TeamMember): Promise<void> => {
    const request = ++inspection.current;
    if (inspecting.current?.humanId !== member.humanId) setInspected(undefined);
    inspecting.current = member;
    setInspectError(undefined);
    setPending(member.humanId);
    try {
      const result = await loadMemberPermissions(call, member.humanId);
      if (request === inspection.current) setInspected({ member, result });
    } catch (failure) {
      if (request === inspection.current) setInspectError(teamErrorText(t, failure));
    } finally {
      if (request === inspection.current) setPending(undefined);
    }
  };

  const reinspect = async (): Promise<void> => {
    const member = inspecting.current;
    if (member === undefined) return;
    const reload = ++inspection.current;
    setPending(member.humanId);
    try {
      const result = await loadMemberPermissions(call, member.humanId);
      if (reload === inspection.current) {
        setInspected({ member, result });
        setInspectError(undefined);
      }
    } catch (failure) {
      if (reload === inspection.current) setInspectError(teamErrorText(t, failure));
    } finally {
      if (reload === inspection.current) setPending(undefined);
    }
  };

  const choose = async (target: TeamRole, id: string, choice: PermissionChoice): Promise<void> => {
    setBusy(true);
    setError(undefined);
    setConflict(undefined);
    try {
      const updated = await updateRole(call, {
        roleId: target.roleId,
        expectedRevision: target.revision,
        ...withChoice(target, id, choice),
      });
      setRoles((current) =>
        current.map((item) => (item.roleId === updated.roleId ? updated : item)),
      );
    } catch (failure) {
      if (teamRefusal(failure) === STALE_HOST_ROLE)
        setConflict({ roleId: target.roleId, id, choice, reloaded: false });
      else setError(teamErrorText(t, failure));
      setBusy(false);
      return;
    }
    await reinspect();
    setBusy(false);
  };

  const reloadRoles = async (): Promise<void> => {
    setBusy(true);
    try {
      setRoles(await loadRoles(call));
      setConflict((current) => (current === undefined ? current : { ...current, reloaded: true }));
    } catch (failure) {
      setError(teamErrorText(t, failure));
    }
    await reinspect();
    setBusy(false);
  };

  const reloadRoleList = async (): Promise<void> => {
    try {
      setRoles(await loadRoles(call));
    } catch (failure) {
      setError(teamErrorText(t, failure));
    }
  };

  const retry = async (): Promise<void> => {
    setRetrying(true);
    await refresh();
    setRetrying(false);
  };

  const context: TeamSectionContext = { view, roles, members };
  const sections = visibleSections(context);
  const section = view === undefined ? undefined : resolveSection(context, requested);

  const views: Record<TeamSectionId, () => ReactNode> = {
    roles: () =>
      view === undefined ? null : (
        <RolesSection
          t={t}
          view={view}
          roles={roles}
          catalog={catalog}
          members={members}
          selected={selectedRole}
          busy={busy}
          error={error}
          inspectError={inspectError}
          pending={pending}
          inspected={inspected}
          notice={
            conflict === undefined ? undefined : (
              <RoleConflictNote
                t={t}
                conflict={conflict}
                busy={busy}
                onReload={() => void reloadRoles()}
              />
            )
          }
          onSelect={(roleId) => {
            setSelectedRole(roleId);
            setConflict(undefined);
            clearInspection();
          }}
          botScope={(role) => (
            <RoleBotScope
              key={role.roleId}
              call={call}
              t={t}
              roleId={role.roleId}
              revision={role.revision}
              onChanged={() => void reloadRoleList()}
            />
          )}
          onChoose={(role, id, choice) => void choose(role, id, choice)}
          onInspect={(member) => void inspect(member)}
        />
      ),
    members: () =>
      view === undefined ? null : (
        <InternalMembersSection
          call={call}
          t={t}
          view={view}
          members={members}
          roles={roles}
          catalog={catalog}
          inspected={inspected}
          pending={pending}
          inspectError={inspectError}
          onInspect={(member) => void inspect(member)}
          onChanged={() => refresh()}
        />
      ),
    bots: () =>
      view === undefined ? null : (
        <BotsSection call={call} t={t} view={view} roles={roles} members={members} />
      ),
    channels: () => <ChannelsSection call={call} t={t} />,
    externalRoles: () => <ExternalRolesSection call={call} t={t} />,
  };

  return (
    <WorkbenchFrame
      navRef={mount}
      label={t('team.workbench.title')}
      nav={(compact) => (
        <SectionNav
          t={t}
          sections={view === undefined ? [] : sections}
          context={context}
          current={section?.id}
          compact={compact}
          onSelect={(id) => {
            if (id === section?.id) return;
            setRequested(id);
            clearInspection();
          }}
        />
      )}
    >
      {loadFailed ? (
        <DetailNotice>
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
        </DetailNotice>
      ) : view === undefined ? (
        <EmptyDetail icon="users">{t('team.workbench.loading')}</EmptyDetail>
      ) : section === undefined ? (
        <EmptyDetail icon="users">{t('team.workbench.noAccess')}</EmptyDetail>
      ) : (
        views[section.id]()
      )}
    </WorkbenchFrame>
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
