import { TextField } from '../primitives/text-field';
import { useState, type ReactNode } from 'react';
import { FlatList, SectionList, View } from 'react-native';
import { ActionMenuButton, type MenuAction } from '../primitives/action-menu-button';
import { confirmDestructive, showActionMenu, showAppDialog } from '../primitives/app-dialog';
import { KeyboardFormScroll } from '../primitives/keyboard-form';

import { errorText } from '../../host/bot-settings';
import {
  GROUP_NAME_MAX,
  memberName,
  type GroupActions,
  type GroupInfo,
  type GroupMember,
  type GroupPending,
} from '../../host/group-channel';
import type { RosterBot } from '../../host/client';
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import {
  SettingsGroupItem,
  SettingsHeading,
  SettingsRow,
  SettingsSection,
} from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { ChevronRightIcon, PlusIcon } from '../shell/icons';
import { t } from '../strings';
import { GroupMark } from './group-mark';
import { SHEET_GROUP, Sheet, SheetActions, SheetCallout, SheetNote } from './sheet';

const MARK = 72;
const ICON = 20;
const MEMBER_AVATAR = 32;

type GroupSection = 'joins' | 'members';

type RowBody =
  | { kind: 'join'; pending: GroupPending }
  | { kind: 'member'; member: GroupMember }
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
        info.members.length === 0 && info.invites.length === 0
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

function RowButtons({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: space.x2 }}>{children}</View>;
}

function RenameSheet({
  visible,
  name,
  onSave,
  onClose,
}: {
  visible: boolean;
  name: string;
  onSave(name: string): Promise<boolean>;
  onClose(): void;
}) {
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
      label={t.groupRename}
      title={t.groupRename}
      onClose={onClose}
      avoidKeyboard
    >
      <KeyboardFormScroll enabled={false}>
        <TextField
          value={draft}
          onChangeText={setDraft}
          accessibilityLabel={t.groupName}
          placeholder={name}
          maxLength={GROUP_NAME_MAX}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => {
            if (next !== '' && next !== name) void save();
          }}
          style={{ marginHorizontal: space.x5 }}
        />
        <SheetActions>
          <View>
            <Button label={t.cancel} on="canvas" onPress={onClose} />
          </View>
          <View>
            <Button
              label={t.groupRenameSave}
              tone="primary"
              on="canvas"
              busy={busy}
              disabled={next === '' || next === name}
              onPress={() => void save()}
            />
          </View>
        </SheetActions>
      </KeyboardFormScroll>
    </Sheet>
  );
}

function InviteSheet({
  visible,
  candidates,
  onInvite,
  onClose,
}: {
  visible: boolean;
  candidates: RosterBot[];
  onInvite(bot: RosterBot): void;
  onClose(): void;
}) {
  const theme = useDesignTheme();
  return (
    <Sheet visible={visible} label={t.groupInvite} title={t.groupInvite} onClose={onClose}>
      {candidates.length === 0 ? (
        <SheetNote>{t.groupInviteNone}</SheetNote>
      ) : (
        <FlatList
          data={candidates}
          keyExtractor={(bot) => bot.slug}
          renderItem={({ item, index }) => (
            <SettingsGroupItem
              first={index === 0}
              last={index === candidates.length - 1}
              on={SHEET_GROUP}
            >
              <SettingsRow
                title={item.displayName}
                on={SHEET_GROUP}
                leading={<MemberAvatar entry={{ slug: item.slug, bot: item }} />}
                trailing={<PlusIcon color={theme.color.muted} size={ICON} />}
                onPress={() => onInvite(item)}
              />
            </SettingsGroupItem>
          )}
        />
      )}
    </Sheet>
  );
}

export function GroupInfoSheet({
  info,
  actions,
  pickAvatar,
  onOpenBot,
  onDisbanded,
  background,
}: {
  info: GroupInfo;
  actions: GroupActions;
  pickAvatar(): Promise<string | undefined>;
  onOpenBot(slug: string): void;
  onDisbanded(): void;
  background?: ReactNode;
}) {
  const theme = useDesignTheme();
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [sheet, setSheet] = useState<'invite' | 'rename' | undefined>();
  const [renameOpened, setRenameOpened] = useState(0);
  const { channel } = info;
  const chevron = <ChevronRightIcon color={theme.color.muted} size={ICON} />;

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

  const chooseAvatar = async () => {
    let avatar: string | undefined;
    try {
      avatar = await pickAvatar();
    } catch {
      setError(t.groupAvatarFailed);
      return;
    }
    if (avatar !== undefined) await run('avatar', () => actions.setAvatar(avatar));
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

  const header = (
    <View style={{ gap: space.x5, paddingBottom: space.x3, paddingHorizontal: space.x5 }}>
      <View style={{ alignItems: 'center', gap: space.x3 }}>
        <GroupMark avatar={channel.avatar} size={MARK} corner={radius.lg} variant="display" />
        <View style={{ alignItems: 'center', gap: space.x1 }}>
          <Text accessibilityRole="header" variant="display" numberOfLines={2}>
            {channel.name}
          </Text>
          <Text variant="meta" tone="muted">
            {t.members(channel.memberCount)}
          </Text>
        </View>
      </View>
      {error === undefined ? null : (
        <View style={{ marginHorizontal: -space.x5, marginBottom: -space.x4 }}>
          <SheetCallout tone="danger">{error}</SheetCallout>
        </View>
      )}
      {background}
      <SettingsSection title={t.groupSettingsSection}>
        <SettingsRow
          title={t.groupName}
          detail={channel.name}
          accessibilityLabel={`${t.groupRename}, ${channel.name}`}
          trailing={chevron}
          onPress={() => {
            setRenameOpened((count) => count + 1);
            setSheet('rename');
          }}
        />
        <Divider />
        <SettingsRow
          title={t.groupAvatarChange}
          leading={<GroupMark avatar={channel.avatar} size={MEMBER_AVATAR} corner={radius.sm} />}
          trailing={busy === 'avatar' ? undefined : chevron}
          onPress={busy === 'avatar' ? undefined : () => void chooseAvatar()}
        />
        {channel.avatar === undefined ? null : (
          <>
            <Divider />
            <SettingsRow
              title={t.groupAvatarRemove}
              onPress={
                busy === 'avatar'
                  ? undefined
                  : () => void run('avatar', () => actions.setAvatar(null))
              }
            />
          </>
        )}
      </SettingsSection>
    </View>
  );

  const footer = (
    <View style={{ paddingTop: space.x6, paddingHorizontal: space.x5 }}>
      <SettingsSection>
        <SettingsRow
          title={t.groupDisband}
          tone="danger"
          onPress={busy === 'disband' ? undefined : confirmDisband}
        />
      </SettingsSection>
    </View>
  );

  return (
    <>
      <View style={{ flex: 1 }}>
        <SectionList
          sections={groupRows(info)}
          keyExtractor={(row) => row.key}
          stickySectionHeadersEnabled={false}
          nestedScrollEnabled
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: space.x6, paddingBottom: space.x5 }}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          renderSectionHeader={({ section }) => (
            <View
              style={{ paddingTop: space.x5, paddingBottom: space.x2, paddingHorizontal: space.x5 }}
            >
              <SettingsHeading>
                {section.section === 'joins' ? t.groupJoinsSection : t.groupMembersSection}
              </SettingsHeading>
            </View>
          )}
          renderItem={({ item }) => (
            <SettingsGroupItem first={item.first} last={item.last}>
              <GroupRow
                row={item}
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
          )}
        />
      </View>
      <InviteSheet
        visible={sheet === 'invite'}
        candidates={info.candidates}
        onClose={() => setSheet(undefined)}
        onInvite={(bot) => {
          setSheet(undefined);
          void run(`add:${bot.slug}`, () => actions.invite(bot.slug));
        }}
      />
      <RenameSheet
        key={renameOpened}
        visible={sheet === 'rename'}
        name={channel.name}
        onSave={(name) => run('rename', () => actions.rename(name))}
        onClose={() => setSheet(undefined)}
      />
    </>
  );
}

function Divider() {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        height: 0,
        borderTopWidth: edge.hairline,
        borderTopColor: theme.layer.raised.divider,
      }}
    />
  );
}

function GroupRow({
  row,
  busy,
  onInvite,
  onOpenBot,
  onMenu,
  memberActions,
  onCancelInvite,
  onDecide,
}: {
  row: Row;
  busy: string | undefined;
  onInvite(): void;
  onOpenBot(slug: string): void;
  onMenu(member: GroupMember): void;
  memberActions(member: GroupMember): MenuAction[];
  onCancelInvite(pending: GroupPending): void;
  onDecide(pending: GroupPending, accept: boolean): void;
}) {
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
  if (row.kind === 'member')
    return (
      <SettingsRow
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
        title={memberName(row.pending)}
        detail={t.groupInvited}
        leading={<MemberAvatar entry={row.pending} />}
        trailing={
          <RowButtons>
            <Button
              label={t.groupInviteCancel}
              on="sheet"
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
      title={memberName(row.pending)}
      detail={t.groupJoinAsk}
      leading={<MemberAvatar entry={row.pending} />}
      trailing={
        <RowButtons>
          <Button
            label={t.groupJoinDecline}
            on="sheet"
            disabled={deciding}
            onPress={() => onDecide(row.pending, false)}
          />
          <Button
            label={t.groupJoinAllow}
            tone="primary"
            on="sheet"
            busy={deciding}
            onPress={() => onDecide(row.pending, true)}
          />
        </RowButtons>
      }
    />
  );
}
