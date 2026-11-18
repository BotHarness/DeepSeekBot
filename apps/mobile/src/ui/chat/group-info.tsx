import { TextField } from '../primitives/text-field';
import { useProfileFocusEffect } from './profile-visibility';
import { useCallback, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { ActionMenuButton, type MenuAction } from '../primitives/action-menu-button';
import { confirmDestructive, showActionMenu, showAppDialog } from '../primitives/app-dialog';
import { KeyboardFormScroll } from '../primitives/keyboard-form';

import type { ProfileAssignment, ProfilePart } from '../../host/bot-profile';
import { errorText } from '@botharness/host-client/bot-settings';
import {
  GROUP_NAME_MAX,
  memberName,
  type GroupActions,
  type GroupInfo,
  type GroupMember,
  type GroupPending,
} from '../../host/group-channel';
import type { HostClient, RosterBot, RosterHuman } from '@botharness/host-client/client';
import { useHumanAvatar } from '../../host/human-profile';
import { AccountAvatar } from '../shell/account-avatar';
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { profileShell, radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import {
  SettingsGroupItem,
  SettingsHeading,
  SettingsRow,
  SettingsSection,
} from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { PlusIcon } from '../shell/icons';
import { useStrings } from '../strings';
import { GroupMark } from './group-mark';
import { AvatarSettings, EditableAvatar, useAvatarEditor } from './avatar-editor';
import {
  assignmentRows,
  profileTabOptions,
  useRememberedProfileTab,
  workingGap,
  workingRows,
  WorkListRow,
} from './bot-profile';
import type { SessionStopper } from '../../host/session-stop';
import { useSessionStops } from './session-stops';
import { InviteSheet } from './invite-sheet';
import { ProfileShell, type ProfileRow, type ProfileTabBody } from './profile-shell';
import { profileTabs, type ProfileTabMemory } from './profile-tabs';
import { ProfileHero } from './profile-hero';
import { Sheet, SheetActions, SheetCallout } from './sheet';

const ON = 'raised' as const;
const ICON = 20;
const MEMBER_AVATAR = 32;

type GroupSection = 'joins' | 'members';

type RowBody =
  | { kind: 'join'; pending: GroupPending }
  | { kind: 'member'; member: GroupMember }
  | { kind: 'person'; person: RosterHuman }
  | { kind: 'invite'; pending: GroupPending }
  | { kind: 'add' }
  | { kind: 'empty' };

type Row = RowBody & { key: string; first: boolean; last: boolean };

function frame(bodies: RowBody[]): Row[] {
  return bodies.map((body, index) => ({
    ...body,
    key:
      body.kind === 'member'
        ? `member:${body.member.slug}`
        : body.kind === 'person'
          ? `person:${body.person.humanId}`
          : body.kind === 'join' || body.kind === 'invite'
            ? `${body.kind}:${body.pending.id}`
            : body.kind,
    first: index === 0,
    last: index === bodies.length - 1,
  }));
}

export function groupRows(info: GroupInfo): Array<{ section: GroupSection; data: Row[] }> {
  const members: RowBody[] = [
    ...(info.candidates.length > 0 ? [{ kind: 'add' } as const] : []),
    ...info.people.map((person) => ({ kind: 'person', person }) as const),
    ...info.members.map((member) => ({ kind: 'member', member }) as const),
    ...info.invites.map((pending) => ({ kind: 'invite', pending }) as const),
  ];
  return [
    ...(info.joins.length === 0
      ? []
      : [
          {
            section: 'joins' as const,
            data: frame(info.joins.map((pending) => ({ kind: 'join', pending }) as const)),
          },
        ]),
    {
      section: 'members',
      data: frame(
        info.members.length === 0 && info.invites.length === 0 && info.people.length === 0
          ? [...members, { kind: 'empty' }]
          : members,
      ),
    },
  ];
}

function MemberAvatar({ entry }: { entry: { slug: string; bot?: RosterBot } }) {
  const theme = useDesignTheme();
  if (entry.bot !== undefined)
    return <BotAvatar bot={entry.bot} size={MEMBER_AVATAR} ring={false} corner={radius.sm} />;
  return (
    <View
      style={{
        width: MEMBER_AVATAR,
        height: MEMBER_AVATAR,
        borderRadius: radius.sm,
        backgroundColor: theme.color.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text strong tone="muted" allowFontScaling={false}>
        {Array.from(memberName(entry))[0] ?? ''}
      </Text>
    </View>
  );
}

function PersonAvatar({ person, client }: { person: RosterHuman; client: HostClient | undefined }) {
  const avatar = useHumanAvatar(client, person.humanId, person.avatarVersion);
  return <AccountAvatar uri={avatar} name={person.displayName} size={MEMBER_AVATAR} />;
}

function RowButtons({ children }: { children: ReactNode }) {
  const theme = useDesignTheme();
  return (
    <View style={{ flexDirection: theme.largeText ? 'column' : 'row', gap: space.x2 }}>
      {children}
    </View>
  );
}

function RenameSheet({
  visible,
  name,
  onSave,
  onClose,
  title,
  fieldLabel,
  placeholder,
  allowEmpty = false,
  testID,
}: {
  visible: boolean;
  name: string;
  onSave(name: string): Promise<boolean>;
  onClose(): void;
  title?: string;
  fieldLabel?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  testID?: string;
}) {
  const t = useStrings();
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  const next = draft.trim();
  const save = async () => {
    setBusy(true);
    const ok = await onSave(next);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Sheet
      visible={visible}
      label={title ?? t.groupRename}
      title={title ?? t.groupRename}
      onClose={onClose}
      avoidKeyboard
    >
      <KeyboardFormScroll enabled={false} nestedScrollEnabled>
        <View style={{ paddingHorizontal: space.x5 }}>
          <TextField
            value={draft}
            onChangeText={setDraft}
            accessibilityLabel={fieldLabel ?? t.groupName}
            placeholder={placeholder ?? name}
            {...(testID === undefined ? {} : { testID })}
            maxLength={GROUP_NAME_MAX}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => {
              if ((allowEmpty || next !== '') && next !== name) void save();
            }}
          />
        </View>
        <SheetActions>
          <Button label={t.cancel} on="canvas" onPress={onClose} />
          <Button
            label={t.groupRenameSave}
            tone="primary"
            on="canvas"
            busy={busy}
            disabled={(!allowEmpty && next === '') || next === name}
            onPress={() => void save()}
          />
        </SheetActions>
      </KeyboardFormScroll>
    </Sheet>
  );
}

export interface GroupProfileProps {
  info: GroupInfo;
  actions: GroupActions;
  pickAvatar(): Promise<string | undefined>;
  onOpenBot(slug: string): void;
  onDisbanded(): void;
  onClose(): void;
  tabMemory: ProfileTabMemory;
  loadWork?: (() => Promise<ProfileAssignment[]>) | undefined;
  onOpenAssignment?: ((assignment: ProfileAssignment) => void) | undefined;
  onChatBackground?: (() => void) | undefined;
  onNotifications?: (() => void) | undefined;
  files?: ((active: boolean, render: (body: ProfileTabBody) => ReactNode) => ReactNode) | undefined;
  stopper?: SessionStopper | undefined;
  nickname?: GroupNickname | undefined;
  client?: HostClient | undefined;
}

export interface GroupNickname {
  value: string | null | undefined;
  name: string | undefined;
  save(nickname: string | null): Promise<void>;
}

export function GroupProfilePage({
  info,
  actions,
  pickAvatar,
  onOpenBot,
  onDisbanded,
  onClose,
  tabMemory,
  loadWork,
  onOpenAssignment,
  onChatBackground,
  onNotifications,
  files,
  stopper,
  nickname,
  client,
}: GroupProfileProps) {
  const t = useStrings();
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [sheet, setSheet] = useState<'invite' | 'rename' | 'nickname' | undefined>();
  const [renameOpened, setRenameOpened] = useState(0);
  const [work, setWork] = useState<ProfilePart<ProfileAssignment[]> | undefined>();
  const avatar = useAvatarEditor({ pick: pickAvatar, save: actions.setAvatar });
  const tabs = profileTabs('group');
  const [tab, setTab] = useRememberedProfileTab(tabMemory, tabs, 'group');
  const { channel } = info;
  const memberBots = info.members.flatMap((member) =>
    member.bot === undefined ? [] : [member.bot],
  );
  const stops = useSessionStops(stopper, memberBots);

  const readWork = useCallback(() => {
    if (loadWork === undefined) return () => {};
    let live = true;
    void loadWork().then(
      (value) => {
        if (live) setWork({ status: 'ready', value });
      },
      (failure: unknown) => {
        if (!live) return;
        const message = errorText(failure);
        setWork((current) =>
          current?.status === 'ready'
            ? { ...current, staleError: message }
            : { status: 'failed', error: message },
        );
      },
    );
    return () => {
      live = false;
    };
  }, [loadWork]);
  useProfileFocusEffect(readWork);

  const run = async (key: string, change: () => Promise<void>): Promise<boolean> => {
    setBusy(key);
    setError(undefined);
    try {
      await change();
      return true;
    } catch (failure) {
      setError(`${t.groupFailed} ${errorText(failure)}`);
      return false;
    } finally {
      setBusy(undefined);
    }
  };

  const memberActions = (member: GroupMember): MenuAction[] => {
    const name = memberName(member);
    return [
      { label: t.groupOpenProfile, icon: 'person', run: () => onOpenBot(member.slug) },
      {
        label: t.groupRemove,
        icon: 'remove',
        destructive: true,
        run: () =>
          confirmDestructive(t.groupRemoveConfirm(name), undefined, t.groupRemove, () =>
            run(`member:${member.slug}`, () => actions.removeMember(member.slug)),
          ),
      },
    ];
  };
  const memberMenu = (member: GroupMember) =>
    showActionMenu(
      memberName(member),
      memberActions(member).map((action) => ({
        text: action.label,
        icon: action.icon,
        onPress: action.run,
        ...(action.destructive === true ? { style: 'destructive' as const } : {}),
      })),
    );

  const confirmDisband = () =>
    showAppDialog(t.groupDisbandConfirm(channel.name), t.groupDisbandDetail, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.groupDisband,
        style: 'destructive',
        onPress: () =>
          run('disband', actions.disband).then((ok) => {
            if (ok) onDisbanded();
            return ok;
          }),
      },
    ]);

  const node = (key: string, render: () => ReactNode): ProfileRow => ({ key, render });
  const gap = (key: string, child: ReactNode) =>
    node(key, () => <View style={{ paddingTop: space.x4 }}>{child}</View>);
  const callout =
    error === undefined
      ? []
      : [
          node('error', () => (
            <View style={{ marginHorizontal: -space.x5, paddingBottom: space.x3 }}>
              <SheetCallout tone="danger">{error}</SheetCallout>
            </View>
          )),
        ];

  const sections = groupRows(info);
  const members: ProfileRow[] = sections.flatMap(({ section, data }) => [
    ...(sections.length === 1
      ? []
      : [
          node(`${section}:heading`, () => (
            <View
              style={{ marginHorizontal: -space.x5, paddingTop: space.x4, paddingBottom: space.x2 }}
            >
              <SettingsHeading>
                {section === 'joins' ? t.groupJoinsSection : t.groupMembersSection}
              </SettingsHeading>
            </View>
          )),
        ]),
    ...data.map((item) =>
      node(item.key, () => (
        <View style={{ marginHorizontal: -space.x5 }}>
          <SettingsGroupItem first={item.first} last={item.last} on={ON}>
            <GroupRow
              row={item}
              client={client}
              busy={busy}
              onInvite={() => setSheet('invite')}
              onOpenBot={onOpenBot}
              onMenu={memberMenu}
              memberActions={memberActions}
              onCancelInvite={(pending) =>
                void run(`invite:${pending.id}`, () => actions.cancelInvite(pending.id))
              }
              onDecide={(pending, accept) =>
                void run(`join:${pending.id}`, () => actions.decideJoin(pending.id, accept))
              }
            />
          </SettingsGroupItem>
        </View>
      )),
    ),
  ]);

  const workRows = loadWork === undefined ? [] : assignmentRows(work);
  const working = workingRows(memberBots, true);
  const settings: ProfileRow[] = [
    node('settings:group', () => (
      <SettingsSection title={t.groupSettingsSection} on={ON}>
        <SettingsRow
          on={ON}
          testID="group-rename"
          title={t.groupName}
          detail={channel.name}
          accessibilityLabel={`${t.groupRename}, ${channel.name}`}
          control={{ kind: 'chevron' }}
          onPress={() => {
            setRenameOpened((count) => count + 1);
            setSheet('rename');
          }}
        />
        {nickname === undefined ? null : (
          <SettingsRow
            on={ON}
            testID="group-nickname"
            title={t.groupNickname}
            detail={nickname.value ?? nickname.name ?? ''}
            control={{ kind: 'chevron' }}
            onPress={
              nickname.value === undefined
                ? undefined
                : () => {
                    setRenameOpened((count) => count + 1);
                    setSheet('nickname');
                  }
            }
          />
        )}
      </SettingsSection>
    )),
    gap(
      'settings:avatar',
      <AvatarSettings
        editor={avatar}
        hasAvatar={channel.avatar !== undefined}
        portrait={<GroupMark avatar={channel.avatar} size={MEMBER_AVATAR} corner={radius.sm} />}
        testID="group-avatar-settings"
        on={ON}
      />,
    ),
    ...(onChatBackground === undefined
      ? []
      : [
          gap(
            'settings:background',
            <SettingsSection on={ON}>
              <SettingsRow
                on={ON}
                testID="group-chat-background"
                title={t.chatBackground.title}
                disclosure
                onPress={onChatBackground}
              />
            </SettingsSection>,
          ),
        ]),
    ...(onNotifications === undefined
      ? []
      : [
          gap(
            'settings:notifications',
            <SettingsSection on={ON}>
              <SettingsRow
                on={ON}
                testID="group-notifications"
                title={t.notifications}
                disclosure
                onPress={onNotifications}
              />
            </SettingsSection>,
          ),
        ]),
    node('settings:disband', () => (
      <View style={{ paddingTop: space.x6 }}>
        <SettingsSection on={ON}>
          <SettingsRow
            on={ON}
            testID="group-disband"
            title={t.groupDisband}
            tone="danger"
            onPress={busy === 'disband' ? undefined : confirmDisband}
          />
        </SettingsSection>
      </View>
    )),
  ];

  const bodies: Record<'members' | 'work' | 'settings', ProfileTabBody> = {
    members: { rows: [...callout, ...members] },
    work: {
      rows: [
        ...working.map((row) =>
          node(row.key, () => <WorkListRow row={row} onRetry={readWork} stops={stops} />),
        ),
        ...(working.length === 0 ? [] : [workingGap(node, stops?.error)]),
        ...workRows.map((row) =>
          node(row.key, () => (
            <WorkListRow row={row} onRetry={readWork} onOpen={onOpenAssignment} />
          )),
        ),
      ],
      empty: <Text tone="muted">{t.profileEmpty.work}</Text>,
    },
    settings: { rows: [...callout, ...settings] },
  };

  const shell = (filesBody: ProfileTabBody) => (
    <ProfileShell
      identity={
        <GroupIdentity
          channel={channel}
          avatar={avatar}
          error={tab === 'settings' ? undefined : avatar.error}
        />
      }
      tabs={tabs}
      options={profileTabOptions(tabs)}
      tab={tab}
      onTab={setTab}
      body={(page) =>
        page === 'members' || page === 'work' || page === 'settings' ? bodies[page] : filesBody
      }
      onClose={onClose}
    />
  );

  return (
    <>
      <View style={{ flex: 1 }}>
        {files === undefined
          ? shell({
              rows: [
                node('files:none', () => (
                  <Text testID="profile-files-none" tone="muted">
                    {t.channelFiles.empty}
                  </Text>
                )),
              ],
            })
          : files(tab === 'files', shell)}
      </View>
      {sheet === 'invite' ? (
        <InviteSheet
          key={channel.id}
          candidates={info.candidates}
          onClose={() => setSheet(undefined)}
          onInvite={(bot) => actions.invite(bot.slug)}
        />
      ) : null}
      <RenameSheet
        key={renameOpened}
        visible={sheet === 'rename'}
        name={channel.name}
        onSave={(name) => run('rename', () => actions.rename(name))}
        onClose={() => setSheet(undefined)}
      />
      {nickname === undefined ? null : (
        <RenameSheet
          key={`nickname:${renameOpened}`}
          visible={sheet === 'nickname'}
          name={nickname.value ?? ''}
          title={t.groupNickname}
          fieldLabel={t.groupNickname}
          placeholder={nickname.name ?? ''}
          allowEmpty
          testID="group-nickname-field"
          onSave={(next) => run('nickname', () => nickname.save(next === '' ? null : next))}
          onClose={() => setSheet(undefined)}
        />
      )}
    </>
  );
}

function GroupIdentity({
  channel,
  avatar,
  error,
}: {
  channel: GroupInfo['channel'];
  avatar: ReturnType<typeof useAvatarEditor>;
  error: string | undefined;
}) {
  const t = useStrings();
  return (
    <ProfileHero
      name={channel.name}
      avatar={
        <EditableAvatar editor={avatar} corner={radius.round} testID="group-avatar-change">
          <GroupMark
            avatar={channel.avatar}
            size={profileShell.avatar}
            corner={radius.round}
            variant="display"
          />
        </EditableAvatar>
      }
    >
      <Text pointerEvents="none" variant="meta" tone="muted">
        {t.members(channel.memberCount + (channel.humanMembers?.length ?? 0))}
      </Text>
      {error === undefined ? null : (
        <Text
          pointerEvents="none"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          tone="danger"
          style={{ textAlign: 'center' }}
        >
          {error}
        </Text>
      )}
    </ProfileHero>
  );
}

function GroupRow({
  row,
  client,
  busy,
  onInvite,
  onOpenBot,
  onMenu,
  memberActions,
  onCancelInvite,
  onDecide,
}: {
  row: Row;
  client: HostClient | undefined;
  busy: string | undefined;
  onInvite(): void;
  onOpenBot(slug: string): void;
  onMenu(member: GroupMember): void;
  memberActions(member: GroupMember): MenuAction[];
  onCancelInvite(pending: GroupPending): void;
  onDecide(pending: GroupPending, accept: boolean): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  if (row.kind === 'empty')
    return (
      <View style={{ paddingHorizontal: space.x5, paddingVertical: space.x4 }}>
        <Text tone="muted">{t.groupNoMembers}</Text>
      </View>
    );
  if (row.kind === 'add')
    return (
      <SettingsRow
        on={ON}
        title={t.groupInvite}
        tone="accent"
        leading={
          <View
            style={{
              width: MEMBER_AVATAR,
              height: MEMBER_AVATAR,
              borderRadius: radius.sm,
              backgroundColor: theme.color.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PlusIcon color={theme.color.accent} size={ICON} />
          </View>
        }
        onPress={onInvite}
      />
    );
  if (row.kind === 'person')
    return (
      <SettingsRow
        on={ON}
        testID={`group-person-${row.person.humanId}`}
        title={row.person.displayName}
        leading={<PersonAvatar person={row.person} client={client} />}
      />
    );
  if (row.kind === 'member')
    return (
      <SettingsRow
        on={ON}
        title={memberName(row.member)}
        {...(row.member.owner ? { detail: t.groupOwner } : {})}
        leading={<MemberAvatar entry={row.member} />}
        accessory={
          <ActionMenuButton
            label={t.groupMemberMenu(memberName(row.member))}
            actions={memberActions(row.member)}
            onOpen={() => onMenu(row.member)}
          />
        }
        onPress={
          busy === `member:${row.member.slug}` ? undefined : () => onOpenBot(row.member.slug)
        }
      />
    );
  if (row.kind === 'invite')
    return (
      <SettingsRow
        on={ON}
        title={memberName(row.pending)}
        detail={t.groupInvited}
        leading={<MemberAvatar entry={row.pending} />}
        trailing={
          <RowButtons>
            <Button
              label={t.groupInviteCancel}
              on={ON}
              fit
              busy={busy === `invite:${row.pending.id}`}
              onPress={() => onCancelInvite(row.pending)}
            />
          </RowButtons>
        }
      />
    );
  const deciding = busy === `join:${row.pending.id}`;
  return (
    <SettingsRow
      on={ON}
      title={memberName(row.pending)}
      detail={t.groupJoinAsk}
      leading={<MemberAvatar entry={row.pending} />}
      trailing={
        <RowButtons>
          <Button
            label={t.groupJoinDecline}
            on={ON}
            fit
            disabled={deciding}
            onPress={() => onDecide(row.pending, false)}
          />
          <Button
            label={t.groupJoinAllow}
            tone="primary"
            on={ON}
            fit
            busy={deciding}
            onPress={() => onDecide(row.pending, true)}
          />
        </RowButtons>
      }
    />
  );
}
