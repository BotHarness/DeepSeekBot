import { useState, type ComponentType, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, SectionList, View } from 'react-native';

import {
  errorText,
  folderBrowsingUnavailable,
  type AccessScope,
  type ApprovalTemplate,
  type ApprovalTemplates,
  type AssignmentAccess,
  type BotSettings,
  type HostFolder,
  type HostFolderListing,
  type Loadable,
  type WorkspaceGrant,
  type WorkspaceOption,
} from '../../host/bot-settings';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { SettingsGroupItem, SettingsRow } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { Toggle } from '../primitives/toggle';
import { CheckIcon, ChevronRightIcon, CloseIcon, FolderIcon, PlusIcon } from '../shell/icons';
import { t } from '../strings';
import {
  Sheet,
  type SheetPageProps,
  SheetActions,
  SheetCallout,
  SheetFailed,
  SheetFooter,
  SheetHeading,
  SheetLoading,
  SheetNote,
  SHEET_GROUP,
} from './sheet';
import { confirmDestructive } from '../primitives/app-dialog';

type Mode = 'main' | 'browse' | 'confirm';
type Pending = { path: string; workspaceId?: string };

type MainRow =
  | { kind: 'grant'; key: string; grant: WorkspaceGrant }
  | { kind: 'empty'; key: string; text: string }
  | { kind: 'failed'; key: string; text: string; retry?: () => void }
  | { kind: 'loading'; key: string }
  | { kind: 'add'; key: string }
  | { kind: 'access'; key: string; access: AssignmentAccess }
  | { kind: 'danger'; key: string }
  | { kind: 'scope'; key: string; scope: AccessScope; selected: boolean }
  | {
      kind: 'template';
      key: string;
      name: string | null;
      title: string;
      detail: string;
      selected: boolean;
    };

type MainSection = {
  key: string;
  title?: string;
  footer?: { text: string; tone?: 'warning' };
  data: MainRow[];
};

type BrowseRow =
  | { kind: 'registered'; key: string; option: WorkspaceOption }
  | { kind: 'folder'; key: string; folder: HostFolder }
  | { kind: 'loading'; key: string }
  | { kind: 'empty'; key: string; text: string; tone?: 'warning' };

const OFF = 'off';

export function templateTitle(template: Pick<ApprovalTemplate, 'name' | 'title'>): string {
  if (template.name === 'cautious') return t.autoApprovalCautious;
  if (template.name === 'get-work-done') return t.autoApprovalGetWorkDone;
  return template.title;
}

export function templateDescription(template: ApprovalTemplate): string {
  if (template.name === 'cautious') return t.autoApprovalCautiousHint;
  if (template.name === 'get-work-done') return t.autoApprovalGetWorkDoneHint;
  return template.description;
}

export function Grouped({
  index,
  count,
  children,
}: {
  index: number;
  count: number;
  children: ReactNode;
}) {
  return (
    <SettingsGroupItem first={index === 0} last={index === count - 1} on={SHEET_GROUP}>
      {children}
    </SettingsGroupItem>
  );
}

export function RowIcon({ kind }: { kind: 'folder' | 'add' }) {
  const theme = useDesignTheme();
  const size = theme.type.title.line;
  return kind === 'folder' ? (
    <FolderIcon color={theme.color.muted} size={size} />
  ) : (
    <PlusIcon color={theme.color.fg} size={size} />
  );
}

function RemoveButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: theme.touch,
        height: theme.touch,
        marginRight: -space.x4,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.round,
        backgroundColor: pressed ? theme.layer[SHEET_GROUP].pressed : theme.layer[SHEET_GROUP].fill,
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <CloseIcon color={theme.color.muted} size={theme.type.meta.line} />
    </Pressable>
  );
}

export function Crumbs({
  crumbs,
  disabled,
  onOpen,
}: {
  crumbs: HostFolder[];
  disabled: boolean;
  onOpen(path: string): void;
}) {
  const theme = useDesignTheme();
  return (
    <ScrollView
      nestedScrollEnabled
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="toolbar"
      contentContainerStyle={{
        gap: space.x2,
        paddingHorizontal: space.x5,
        paddingBottom: space.x3,
      }}
    >
      {crumbs.map((crumb, index) => {
        const current = index === crumbs.length - 1;
        return (
          <Pressable
            key={crumb.path}
            accessibilityRole="button"
            accessibilityLabel={crumb.name}
            accessibilityState={{ selected: current, disabled }}
            disabled={disabled || current}
            onPress={() => onOpen(crumb.path)}
            hitSlop={space.x2}
            style={({ pressed }) => ({
              paddingHorizontal: space.x4,
              paddingVertical: space.x3,
              borderRadius: radius.round,
              backgroundColor: pressed
                ? theme.layer.canvas.pressed
                : current
                  ? theme.layer.canvas.selected
                  : theme.layer[SHEET_GROUP].fill,
            })}
          >
            <Text variant="meta" tone={current ? 'fg' : 'muted'} strong={current} numberOfLines={1}>
              {crumb.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function WorkspaceSheet({
  page,
  visible,
  botName,
  settings,
  grants,
  access,
  templates,
  onRetryGrants,
  onGrantsChanged,
  onAccess,
  onTemplates,
  onClose,
}: {
  page?: ComponentType<SheetPageProps> | undefined;
  visible: boolean;
  botName: string;
  settings: BotSettings | undefined;
  grants: Loadable<WorkspaceGrant[]>;
  access: Loadable<AssignmentAccess>;
  templates: Loadable<ApprovalTemplates>;
  onRetryGrants(): void;
  onGrantsChanged(): void;
  onAccess(access: AssignmentAccess): void;
  onTemplates(templates: ApprovalTemplates): void;
  onClose(): void;
}) {
  const theme = useDesignTheme();
  const [mode, setMode] = useState<Mode>('main');
  const [listing, setListing] = useState<Loadable<HostFolderListing>>({
    status: 'loading',
  });
  const [options, setOptions] = useState<WorkspaceOption[]>([]);
  const [pending, setPending] = useState<Pending>();
  const [confirmDanger, setConfirmDanger] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const mutate = (key: string, work: () => Promise<void>, after?: () => void) => {
    if (busy !== undefined) return;
    setBusy(key);
    setError(undefined);
    void work()
      .then(
        () => after?.(),
        (cause: unknown) => setError(`${t.settingFailed} ${errorText(cause)}`),
      )
      .finally(() => setBusy(undefined));
  };

  const close = () => {
    if (busy !== undefined) return;
    onClose();
  };

  if (settings === undefined)
    return (
      <Sheet
        page={page}
        visible={visible}
        label={t.workspaceTitle(botName)}
        title={t.workspaceTitle(botName)}
        onClose={close}
      >
        <SheetLoading />
      </Sheet>
    );

  const granted = grants.status === 'ready' ? grants.value : [];

  const browse = (path?: string) => {
    setListing({ status: 'loading' });
    void settings.listFolders(path).then(
      (value) => setListing({ status: 'ready', value }),
      (cause: unknown) =>
        setListing({
          status: 'failed',
          error: folderBrowsingUnavailable(cause) ? t.browseUnavailable : errorText(cause),
        }),
    );
  };

  const startBrowse = () => {
    setError(undefined);
    setMode('browse');
    setOptions([]);
    void settings.loadWorkspaceOptions().then(setOptions, () => undefined);
    browse();
  };

  const choose = (path: string, workspaceId?: string) =>
    mutate('resolve', async () => {
      const resolved = await settings.resolveFolder(path);
      setPending({
        path: resolved.path,
        ...(workspaceId === undefined ? {} : { workspaceId }),
      });
      setMode('confirm');
    });

  const remove = (grant: WorkspaceGrant) =>
    mutate(
      `grant:${grant.id}`,
      async () => {
        await settings.revokeGrant(grant.id);
      },
      onGrantsChanged,
    );

  const confirmGrant = () => {
    if (pending === undefined) return;
    mutate(
      'confirm',
      async () => {
        await settings.authorizeFolder(pending.path, pending.workspaceId);
      },
      () => {
        setPending(undefined);
        setMode('main');
        onGrantsChanged();
      },
    );
  };

  const changeAccess = (key: string, work: () => Promise<AssignmentAccess>) =>
    mutate(key, async () => {
      const next = await work();
      onAccess(next);
      setConfirmDanger(false);
    });

  const chooseTemplate = (name: string | null) => {
    if (templates.status !== 'ready') return;
    const previous = templates.value;
    onTemplates({ ...previous, selected: name });
    mutate(`template:${name ?? OFF}`, async () => {
      try {
        await settings.setTemplate(name);
      } catch (cause) {
        onTemplates(previous);
        throw cause;
      }
    });
  };

  const trailingCheck = (key: string, selected: boolean) =>
    busy === key ? (
      <ActivityIndicator />
    ) : selected ? (
      <CheckIcon color={theme.color.fg} size={theme.type.title.line} />
    ) : undefined;

  const notice = (
    <>
      {busy === undefined ? null : <SheetNote>{t.workspaceWorking}</SheetNote>}
      {error === undefined ? null : <SheetCallout tone="danger">{error}</SheetCallout>}
    </>
  );

  if (mode === 'confirm' && pending !== undefined) {
    const name =
      pending.path
        .split(/[\\/]/)
        .filter((part) => part !== '')
        .pop() ?? pending.path;
    return (
      <Sheet
        page={page}
        visible={visible}
        label={t.confirmGrant(botName)}
        title={t.confirmGrant(botName)}
        onClose={close}
      >
        {notice}
        <SettingsGroupItem first last on={SHEET_GROUP}>
          <SettingsRow
            title={name}
            detail={pending.path}
            leading={<RowIcon kind="folder" />}
            on={SHEET_GROUP}
          />
        </SettingsGroupItem>
        <SheetFooter>{t.grantScope}</SheetFooter>
        <SheetActions>
          <Button
            label={t.cancel}
            on="canvas"
            disabled={busy !== undefined}
            onPress={() => {
              setPending(undefined);
              setMode('browse');
            }}
          />
          <Button
            label={t.authorize}
            tone="primary"
            on="canvas"
            busy={busy === 'confirm'}
            disabled={busy !== undefined}
            onPress={confirmGrant}
          />
        </SheetActions>
      </Sheet>
    );
  }

  if (mode === 'browse') {
    const grantedIds = new Set(granted.map((grant) => grant.workspaceId));
    const registered = options.filter((option) => !grantedIds.has(option.id));
    const folders =
      listing.status === 'ready' ? listing.value.entries.filter((entry) => !entry.hidden) : [];
    const folderRows: BrowseRow[] =
      listing.status === 'loading'
        ? [{ kind: 'loading', key: 'loading' }]
        : listing.status === 'failed'
          ? [
              {
                kind: 'empty',
                key: 'failed',
                text: listing.error,
                tone: 'warning',
              },
            ]
          : folders.length === 0
            ? [{ kind: 'empty', key: 'empty', text: t.browseEmpty }]
            : folders.map((folder) => ({
                kind: 'folder',
                key: `folder:${folder.path}`,
                folder,
              }));
    const sections = [
      ...(registered.length === 0
        ? []
        : [
            {
              key: 'registered',
              title: t.registeredFolders,
              data: registered.map((option): BrowseRow => ({
                kind: 'registered',
                key: `option:${option.id}`,
                option,
              })),
            },
          ]),
      {
        key: 'folders',
        title: t.browseTitle,
        footer:
          listing.status === 'ready' && listing.value.truncated ? t.browseTruncated : undefined,
        data: folderRows,
      },
    ];
    return (
      <Sheet
        page={page}
        visible={visible}
        label={t.browseTitle}
        title={t.addFolder}
        subtitle={t.browseHint}
        onClose={close}
      >
        {listing.status === 'ready' ? (
          <Crumbs
            crumbs={listing.value.crumbs}
            disabled={busy !== undefined}
            onOpen={(path) => browse(path)}
          />
        ) : null}
        <SectionList<
          BrowseRow,
          {
            key: string;
            title: string;
            footer?: string | undefined;
            data: readonly BrowseRow[];
          }
        >
          style={page !== undefined ? { flex: 1 } : { flexShrink: 1 }}
          sections={sections}
          keyExtractor={(row) => row.key}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={notice}
          renderSectionHeader={({ section }) => <SheetHeading>{section.title}</SheetHeading>}
          renderSectionFooter={({ section }) =>
            section.footer === undefined ? null : <SheetFooter>{section.footer}</SheetFooter>
          }
          renderItem={({ item, index, section }) => (
            <Grouped index={index} count={section.data.length}>
              {item.kind === 'loading' ? (
                <SheetLoading />
              ) : item.kind === 'empty' ? (
                <SettingsRow
                  title={item.text}
                  tone={item.tone === 'warning' ? 'warning' : 'muted'}
                  on={SHEET_GROUP}
                />
              ) : item.kind === 'registered' ? (
                <SettingsRow
                  title={item.option.title}
                  detail={item.option.path}
                  leading={<RowIcon kind="folder" />}
                  on={SHEET_GROUP}
                  onPress={
                    busy === undefined ? () => choose(item.option.path, item.option.id) : undefined
                  }
                />
              ) : (
                <SettingsRow
                  title={item.folder.name}
                  leading={<RowIcon kind="folder" />}
                  trailing={
                    <ChevronRightIcon color={theme.color.subtle} size={theme.type.meta.line} />
                  }
                  on={SHEET_GROUP}
                  onPress={busy === undefined ? () => browse(item.folder.path) : undefined}
                />
              )}
            </Grouped>
          )}
        />
        <SheetActions>
          <Button
            label={t.back}
            on="canvas"
            disabled={busy !== undefined}
            onPress={() => {
              setError(undefined);
              setMode('main');
            }}
          />
          <Button
            label={t.authorizeHere}
            tone="primary"
            on="canvas"
            busy={busy === 'resolve'}
            disabled={busy !== undefined || listing.status !== 'ready'}
            onPress={() => {
              if (listing.status === 'ready') choose(listing.value.path);
            }}
          />
        </SheetActions>
      </Sheet>
    );
  }

  const folderRows: MainRow[] =
    grants.status === 'loading'
      ? [{ kind: 'loading', key: 'grants-loading' }]
      : grants.status === 'failed'
        ? [
            {
              kind: 'failed',
              key: 'grants-failed',
              text: t.workspaceFailed,
              retry: onRetryGrants,
            },
          ]
        : [
            ...(grants.value.length === 0
              ? [
                  {
                    kind: 'empty',
                    key: 'grants-empty',
                    text: t.workspaceNoFolders,
                  } as const,
                ]
              : grants.value.map((grant): MainRow => ({
                  kind: 'grant',
                  key: `grant:${grant.id}`,
                  grant,
                }))),
            { kind: 'add', key: 'add' },
          ];

  const fullAccessOn = access.status === 'ready' && access.value.mode === 'danger-full-access';
  const accessRows: MainRow[] =
    access.status === 'loading'
      ? [{ kind: 'loading', key: 'access-loading' }]
      : access.status === 'failed'
        ? [{ kind: 'failed', key: 'access-failed', text: access.error }]
        : [
            { kind: 'access', key: 'access', access: access.value },
            ...(confirmDanger ? [{ kind: 'danger', key: 'danger' } as const] : []),
          ];

  const templateRows: MainRow[] =
    templates.status === 'loading'
      ? [{ kind: 'loading', key: 'templates-loading' }]
      : templates.status === 'failed'
        ? [{ kind: 'failed', key: 'templates-failed', text: templates.error }]
        : [
            {
              kind: 'template',
              key: `template:${OFF}`,
              name: null,
              title: t.autoApprovalOff,
              detail: t.autoApprovalOffHint,
              selected: templates.value.selected === null,
            },
            ...templates.value.templates.map((template): MainRow => ({
              kind: 'template',
              key: `template:${template.name}`,
              name: template.name,
              title: templateTitle(template),
              detail: templateDescription(template),
              selected: templates.value.selected === template.name,
            })),
          ];

  const sections: MainSection[] = [
    { key: 'folders', title: t.workspaceFolders, data: folderRows },
    {
      key: 'access',
      title: t.workspaceAccess,
      ...(access.status !== 'ready'
        ? {}
        : fullAccessOn
          ? {
              footer: {
                text:
                  access.value.scope === 'assignments' ? t.fullAccessOnAssignments : t.fullAccessOn,
                tone: 'warning',
              },
            }
          : { footer: { text: t.fullAccessDetail } }),
      data: accessRows,
    },
    ...(fullAccessOn && access.status === 'ready'
      ? [
          {
            key: 'scope',
            title: t.fullAccessScope,
            data: (['chat', 'assignments'] as const).map((scope): MainRow => ({
              kind: 'scope',
              key: `scope:${scope}`,
              scope,
              selected: access.value.scope === scope,
            })),
          },
        ]
      : []),
    {
      key: 'templates',
      title: t.autoApproval,
      ...(templates.status === 'ready' ? { footer: { text: t.autoApprovalFooter } } : {}),
      data: templateRows,
    },
  ];

  const row = (item: MainRow) => {
    switch (item.kind) {
      case 'loading':
        return <SheetLoading />;
      case 'empty':
        return <SettingsRow title={item.text} tone="muted" on={SHEET_GROUP} />;
      case 'failed':
        return item.retry === undefined ? (
          <SettingsRow title={item.text} tone="danger" on={SHEET_GROUP} />
        ) : (
          <SheetFailed message={item.text} onRetry={item.retry} on={SHEET_GROUP} />
        );
      case 'grant':
        return (
          <SettingsRow
            title={item.grant.workspaceTitle}
            detail={`${item.grant.orchestratorWrite ? t.folderCanEdit : t.folderReadOnly} · ${item.grant.workspacePath}`}
            leading={<RowIcon kind="folder" />}
            on={SHEET_GROUP}
            trailing={
              busy === item.key ? (
                <ActivityIndicator />
              ) : (
                <RemoveButton
                  label={t.removeFolder(item.grant.workspaceTitle)}
                  disabled={busy !== undefined}
                  onPress={() =>
                    confirmDestructive(
                      t.confirmAction(t.removeFolder(item.grant.workspaceTitle)),
                      undefined,
                      t.remove,
                      () => remove(item.grant),
                    )
                  }
                />
              )
            }
          />
        );
      case 'add':
        return (
          <SettingsRow
            title={t.addFolder}
            leading={<RowIcon kind="add" />}
            on={SHEET_GROUP}
            {...(busy === undefined ? { onPress: startBrowse } : {})}
          />
        );
      case 'access':
        return (
          <SettingsRow
            title={t.fullAccess}
            detail={t.fullAccessSummary}
            on={SHEET_GROUP}
            trailing={
              busy === 'safe-access' ? (
                <ActivityIndicator />
              ) : (
                <Toggle
                  label={t.fullAccess}
                  value={item.access.mode === 'danger-full-access' || confirmDanger}
                  disabled={busy !== undefined}
                  on={SHEET_GROUP}
                  onChange={(on) => {
                    if (on) setConfirmDanger(true);
                    else if (confirmDanger) setConfirmDanger(false);
                    else
                      changeAccess('safe-access', () =>
                        settings.setAccess('workspace-write', false),
                      );
                  }}
                />
              )
            }
          />
        );
      case 'danger':
        return (
          <View
            accessibilityRole="alert"
            style={{
              gap: space.x3,
              paddingHorizontal: space.x5,
              paddingVertical: space.x4,
            }}
          >
            <Text strong tone="danger">
              {t.fullAccessConfirmTitle}
            </Text>
            <Text variant="meta" tone="muted">
              {t.fullAccessConfirmRisk}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                gap: space.x3,
                paddingTop: space.x2,
              }}
            >
              <Button
                label={t.cancel}
                on={SHEET_GROUP}
                disabled={busy !== undefined}
                onPress={() => setConfirmDanger(false)}
              />
              <Button
                label={t.fullAccessConfirm}
                tone="danger"
                on={SHEET_GROUP}
                busy={busy === 'danger-access'}
                disabled={busy !== undefined}
                onPress={() =>
                  changeAccess('danger-access', () =>
                    settings.setAccess('danger-full-access', true),
                  )
                }
              />
            </View>
          </View>
        );
      case 'scope':
        return (
          <SettingsRow
            title={item.scope === 'chat' ? t.fullAccessScopeChat : t.fullAccessScopeAssignments}
            detail={
              item.scope === 'chat'
                ? t.fullAccessScopeChatDetail
                : t.fullAccessScopeAssignmentsDetail
            }
            selected={item.selected}
            on={SHEET_GROUP}
            trailing={trailingCheck(item.key, item.selected)}
            {...(busy === undefined && !item.selected
              ? {
                  onPress: () =>
                    changeAccess(item.key, () =>
                      settings.setAccess('danger-full-access', true, item.scope),
                    ),
                }
              : {})}
          />
        );
      case 'template':
        return (
          <SettingsRow
            title={item.title}
            detail={item.detail}
            selected={item.selected}
            on={SHEET_GROUP}
            trailing={trailingCheck(item.key, item.selected)}
            {...(busy === undefined && !item.selected
              ? { onPress: () => chooseTemplate(item.name) }
              : {})}
          />
        );
    }
  };

  return (
    <Sheet
      page={page}
      visible={visible}
      label={t.workspaceTitle(botName)}
      title={t.workspaceTitle(botName)}
      onClose={close}
    >
      <SectionList<MainRow, MainSection>
        nestedScrollEnabled
        style={page !== undefined ? { flex: 1 } : { flexShrink: 1 }}
        sections={sections}
        keyExtractor={(item) => item.key}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={notice}
        renderSectionHeader={({ section }) =>
          section.title === undefined ? null : <SheetHeading>{section.title}</SheetHeading>
        }
        renderSectionFooter={({ section }) =>
          section.footer === undefined ? null : section.footer.tone === 'warning' ? (
            <View style={{ paddingTop: space.x3 }}>
              <SheetCallout tone="warning">{section.footer.text}</SheetCallout>
            </View>
          ) : (
            <SheetFooter>{section.footer.text}</SheetFooter>
          )
        }
        renderItem={({ item, index, section }) => (
          <Grouped index={index} count={section.data.length}>
            {row(item)}
          </Grouped>
        )}
      />
    </Sheet>
  );
}
