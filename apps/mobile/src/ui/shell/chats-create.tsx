import { router, useFocusEffect, type NativeStackHeaderItem } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { cloudError } from '../../cloud/client';
import { targetsFor, type CreationTarget } from '../../host/creation-targets';
import { useHostSession } from '../../host/host-session';
import { showAppDialog } from '../primitives/app-dialog';
import { menuSymbols } from '../primitives/menu-icon';
import { useStrings } from '../strings';
import { botSourceHref, chatsCreationActions, type BotSource } from './creation-menu-items';
import { MessagePersonSheet } from './message-person-sheet';
import { startNewGroup } from './new-group';
import { openCloudCreation } from './open-cloud-creation';
import { useCreationTargets } from './use-creation-targets';

export type ChatsCreateGlyph = keyof typeof menuSymbols;

export type ChatsCreateEntry = {
  id: string;
  label: string;
  glyph: ChatsCreateGlyph;
  run(): void;
};

export type ChatsCreateButton = {
  label: string;
  disabled: boolean;
  bot: { label: string; sources: ChatsCreateEntry[] } | undefined;
  actions: ChatsCreateEntry[];
};

export type ChatsCreate = {
  button: ChatsCreateButton | undefined;
  nativeItem: NativeStackHeaderItem | undefined;
  sheet: ReactNode;
};

const botSources: readonly [BotSource, ChatsCreateGlyph][] = [
  ['blank', 'plus'],
  ['marketplace', 'marketplace'],
  ['zip', 'zip'],
  ['git', 'git'],
];

export function useChatsCreate(scope: string): ChatsCreate {
  const t = useStrings();
  const targets = useCreationTargets(scope);
  const actions = chatsCreationActions(scope, targets);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const [personHostId, setPersonHostId] = useState<string>();
  const personSession = useHostSession(personHostId ?? actions.person?.hostId);
  useFocusEffect(
    useCallback(
      () => () => {
        generation.current++;
        setPersonHostId(undefined);
      },
      [],
    ),
  );
  const cloud = async (
    target: Extract<CreationTarget, { kind: 'cloud' }>,
    action: 'channel' | 'invite',
  ) => {
    const version = generation.current;
    setBusy(true);
    try {
      await openCloudCreation(target, action, () => version === generation.current);
    } catch (error) {
      if (version === generation.current)
        showAppDialog(t.createHere, cloudError(error), [{ text: t.close, style: 'cancel' }]);
    } finally {
      setBusy(false);
    }
  };
  const sheet =
    personHostId === undefined ? null : (
      <MessagePersonSheet
        client={personSession.saved?.hostId === personHostId ? personSession.client : undefined}
        onClose={() => setPersonHostId(undefined)}
        onOpened={({ channelId, name }) => {
          setPersonHostId(undefined);
          router.push({
            pathname: '/channel/[id]',
            params: { id: channelId, hostId: personHostId, person: name },
          });
        }}
      />
    );
  if (!actions.bot && !actions.group && !actions.person && !actions.invite && !actions.join)
    return { button: undefined, nativeItem: undefined, sheet };
  const person = actions.person;
  const botTarget = scope === 'all' ? undefined : targetsFor('bot', scope, targets)[0];
  const botHostId = botTarget?.kind === 'computer' ? botTarget.hostId : undefined;
  const invite = actions.invite?.kind === 'cloud' ? actions.invite : undefined;
  const menu: ChatsCreateButton = {
    label: t.createHere,
    disabled: busy,
    bot: actions.bot
      ? {
          label: t.botCreation.title,
          sources: botSources.map(([source, glyph]) => ({
            id: source,
            label: t.chatsCreate[source],
            glyph,
            run: () => router.push(botSourceHref(source, botHostId)),
          })),
        }
      : undefined,
    actions: [
      ...(actions.group
        ? [
            {
              id: 'group',
              label: t.chatsCreate.group,
              glyph: 'group' as const,
              run: () => startNewGroup(scope, targets, (target) => void cloud(target, 'channel')),
            },
          ]
        : []),
      ...(person
        ? [
            {
              id: 'person',
              label: t.chatsCreate.person,
              glyph: 'chat' as const,
              run: () => setPersonHostId(person.hostId),
            },
          ]
        : []),
      ...(actions.join
        ? [
            {
              id: 'join',
              label: t.chatsCreate.join,
              glyph: 'join' as const,
              run: () => router.push('/cloud-join'),
            },
          ]
        : []),
      ...(invite
        ? [
            {
              id: 'invite',
              label: t.chatsCreate.invite,
              glyph: 'invite' as const,
              run: () => void cloud(invite, 'invite'),
            },
          ]
        : []),
    ],
  };
  if (Platform.OS !== 'ios') return { button: menu, nativeItem: undefined, sheet };
  return { button: undefined, nativeItem: nativeCreateItem(menu), sheet };
}

function nativeAction(entry: ChatsCreateEntry) {
  return {
    type: 'action' as const,
    label: entry.label,
    icon: { type: 'sfSymbol' as const, name: menuSymbols[entry.glyph].ios },
    onPress: entry.run,
  };
}

export function nativeCreateItem(menu: ChatsCreateButton): NativeStackHeaderItem {
  return {
    type: 'menu',
    identifier: 'chats-create-button',
    label: menu.label,
    icon: { type: 'sfSymbol', name: 'plus' },
    sharesBackground: true,
    disabled: menu.disabled,
    menu: {
      items: [
        ...(menu.bot
          ? [
              {
                type: 'submenu' as const,
                label: menu.bot.label,
                icon: { type: 'sfSymbol' as const, name: menuSymbols.bot.ios },
                items: menu.bot.sources.map(nativeAction),
              },
            ]
          : []),
        ...menu.actions.map(nativeAction),
      ],
    },
  };
}
