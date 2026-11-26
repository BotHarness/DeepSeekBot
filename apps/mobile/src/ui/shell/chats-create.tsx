import { router, useFocusEffect, type NativeStackHeaderItem } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { cloudError } from '../../cloud/client';
import { targetsFor, type CreationTarget } from '../../host/creation-targets';
import { showAppDialog } from '../primitives/app-dialog';
import { menuSymbols } from '../primitives/menu-icon';
import { useStrings } from '../strings';
import { botSourceHref, chatsCreationActions, type BotSource } from './creation-menu-items';
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
  useFocusEffect(
    useCallback(
      () => () => {
        generation.current++;
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
  if (!actions.bot && !actions.group && !actions.invite && !actions.join)
    return { button: undefined, nativeItem: undefined };
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
  if (Platform.OS !== 'ios') return { button: menu, nativeItem: undefined };
  return { button: undefined, nativeItem: nativeCreateItem(menu) };
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
