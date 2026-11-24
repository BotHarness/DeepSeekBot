import { router, useFocusEffect, type NativeStackHeaderItem } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AccessibilityInfo, Platform, useWindowDimensions, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cloudError } from '../../cloud/client';
import { targetsFor, type CreationTarget } from '../../host/creation-targets';
import { useDesignTheme } from '../design/theme';
import { headerBarItem } from '../design/tokens';
import { haptic } from '../haptics';
import { showAppDialog } from '../primitives/app-dialog';
import { useStrings } from '../strings';
import { botSourceHref, chatsCreationActions } from './creation-menu-items';
import { startNewGroup } from './new-group';
import { CreationPanel, type CreationAnchor } from './creation-panel';
import { CreationRow } from './creation-row';
import {
  ArrowBackIcon,
  BrowserIcon,
  ChatsIcon,
  FileIcon,
  GitCommitIcon,
  MembersIcon,
  PersonIcon,
  PlusIcon,
  ShareIcon,
} from './icons';
import { openCloudCreation } from './open-cloud-creation';
import { useCreationTargets } from './use-creation-targets';

export type ChatsCreateButton = {
  label: string;
  expanded: boolean;
  disabled: boolean;
  triggerRef: RefObject<ViewInstance | null>;
  onPress(): void;
};

export type ChatsCreate = {
  button: ChatsCreateButton | undefined;
  nativeItem: NativeStackHeaderItem | undefined;
  panel: ReactNode;
};

export function useChatsCreate(scope: string): ChatsCreate {
  const t = useStrings();
  const theme = useDesignTheme();
  const viewport = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const targets = useCreationTargets(scope);
  const actions = chatsCreationActions(scope, targets);
  const [anchor, setAnchor] = useState<CreationAnchor>();
  const open = anchor !== undefined;
  const [busy, setBusy] = useState(false);
  const opening = useRef(false);
  const trigger = useRef<ViewInstance>(null);
  const generation = useRef(0);
  useFocusEffect(
    useCallback(
      () => () => {
        generation.current++;
        opening.current = false;
        setAnchor(undefined);
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
  const newGroup = () => startNewGroup(scope, targets, (target) => void cloud(target, 'channel'));
  if (!actions.bot && !actions.group && !actions.invite && !actions.join)
    return { button: undefined, nativeItem: undefined, panel: null };
  const iconSize = theme.type.title.line * theme.fontScale;
  const botTarget = scope === 'all' ? undefined : targetsFor('bot', scope, targets)[0];
  const botHostId = botTarget?.kind === 'computer' ? botTarget.hostId : undefined;
  const invite = actions.invite?.kind === 'cloud' ? actions.invite : undefined;
  const sources = [
    ['blank', PlusIcon],
    ['marketplace', BrowserIcon],
    ['zip', FileIcon],
    ['git', GitCommitIcon],
  ] as const;
  const press = () => {
    if (opening.current) return;
    if (!trigger.current) {
      if (Platform.OS !== 'ios') return;
      opening.current = true;
      haptic('menu');
      setAnchor({
        top: insets.top + headerBarItem.top,
        right: insets.right + headerBarItem.margin,
        size: headerBarItem.size,
      });
      return;
    }
    opening.current = true;
    haptic('menu');
    trigger.current.measureInWindow((x, y, width, height) => {
      const size = Math.min(width, height);
      setAnchor({
        top: y + (height - size) / 2,
        right: viewport.width - x - width + (width - size) / 2,
        size,
      });
    });
  };
  return {
    button:
      Platform.OS === 'ios'
        ? undefined
        : {
            label: t.createHere,
            expanded: open,
            disabled: busy,
            triggerRef: trigger,
            onPress: press,
          },
    nativeItem:
      Platform.OS === 'ios'
        ? {
            type: 'button',
            identifier: 'chats-create-button',
            label: t.createHere,
            icon: { type: 'sfSymbol', name: 'plus' },
            sharesBackground: true,
            disabled: busy || open,
            onPress: press,
          }
        : undefined,
    panel: anchor ? (
      <CreationPanel
        anchor={anchor}
        onDismiss={(action) => {
          opening.current = false;
          setAnchor(undefined);
          if (action) action();
          else
            requestAnimationFrame(() => {
              if (trigger.current)
                AccessibilityInfo.sendAccessibilityEvent?.(trigger.current, 'focus');
            });
        }}
      >
        {({ dismiss, firstAction, level, showSources, back }) => {
          const rows =
            level === 'sources'
              ? [
                  { id: 'back', label: t.back, icon: ArrowBackIcon, onPress: back },
                  ...(actions.bot
                    ? sources.map(([source, icon]) => ({
                        id: source,
                        label: t.chatsCreate[source],
                        icon,
                        onPress: () => dismiss(() => router.push(botSourceHref(source, botHostId))),
                      }))
                    : []),
                ]
              : [
                  ...(actions.bot
                    ? [
                        {
                          id: 'bot',
                          label: t.botCreation.title,
                          icon: PersonIcon,
                          onPress: showSources,
                        },
                      ]
                    : []),
                  ...(actions.group
                    ? [
                        {
                          id: 'group',
                          label: t.chatsCreate.group,
                          icon: MembersIcon,
                          onPress: () => dismiss(newGroup),
                        },
                      ]
                    : []),
                  ...(actions.join
                    ? [
                        {
                          id: 'join',
                          label: t.chatsCreate.join,
                          icon: ChatsIcon,
                          onPress: () => dismiss(() => router.push('/cloud-join')),
                        },
                      ]
                    : []),
                  ...(invite
                    ? [
                        {
                          id: 'invite',
                          label: t.chatsCreate.invite,
                          icon: ShareIcon,
                          onPress: () => dismiss(() => void cloud(invite, 'invite')),
                        },
                      ]
                    : []),
                ];
          return rows.map(({ id, label, icon: Icon, onPress }, index) => (
            <CreationRow
              key={id}
              focusRef={index === 0 ? firstAction : undefined}
              testID={`chats-create-${id}`}
              label={label}
              icon={<Icon color={theme.color.fg} size={iconSize} />}
              onPress={onPress}
              onBack={back}
            />
          ));
        }}
      </CreationPanel>
    ) : null,
  };
}
