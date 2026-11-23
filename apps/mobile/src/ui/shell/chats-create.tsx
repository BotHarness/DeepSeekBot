import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, Platform, Pressable } from 'react-native';
import { cloudError } from '../../cloud/client';
import { cloudAvailable } from '../../cloud/available';
import { targetsFor, type CreationTarget } from '../../host/creation-targets';
import { pressTint, useDesignTheme } from '../design/theme';
import { fab, radius, space } from '../design/tokens';
import { haptic } from '../haptics';
import { showAppDialog } from '../primitives/app-dialog';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { chatsCreationActions } from './creation-menu-items';
import { CreationPanel } from './creation-panel';
import { CreationRow } from './creation-row';
import { ChatsIcon, PersonIcon, PlusIcon, ShareIcon } from './icons';
import { NavigationMaterial } from './navigation-material';
import { openCloudCreation } from './open-cloud-creation';
import { useCreationTargets } from './use-creation-targets';

export function ChatsCreate({ scope, bottom }: { scope: string; bottom: number }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const targets = useCreationTargets();
  const actions = chatsCreationActions(scope, targets);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const opening = useRef(false);
  const trigger = useRef<ComponentRef<typeof Pressable>>(null);
  const generation = useRef(0);
  useFocusEffect(
    useCallback(
      () => () => {
        generation.current++;
        opening.current = false;
        setOpen(false);
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
  const newGroup = () => {
    const choices = targetsFor('channel', scope, targets);
    const target = scope === 'all' ? undefined : choices[0];
    if (scope === 'all' && cloudAvailable && choices.some((choice) => choice.kind === 'cloud')) {
      router.push('/create-group-target');
    } else if (target?.kind === 'cloud') {
      void cloud(target, 'channel');
    } else {
      router.push({
        pathname: '/create-channel',
        params: target ? { entry: 'host', hostId: target.hostId } : { entry: 'all' },
      });
    }
  };
  if (!actions.bot && !actions.group && !actions.invite && !actions.join) return null;
  const android = Platform.OS === 'android';
  const iconSize = theme.type.title.line;
  const rows = [
    ...(actions.bot
      ? ([
          {
            id: 'bot',
            label: t.botCreation.title,
            icon: PersonIcon,
            select: () => {
              const host = scope === 'all' ? undefined : targetsFor('bot', scope, targets)[0];
              router.push({
                pathname: '/bot-source',
                params: host?.kind === 'computer' ? { hostId: host.hostId } : {},
              });
            },
          },
        ] as const)
      : []),
    ...(actions.join
      ? ([
          {
            id: 'join',
            label: t.chatsCreate.join,
            icon: ChatsIcon,
            select: () => router.push('/cloud-join'),
          },
        ] as const)
      : []),
    ...(actions.invite?.kind === 'cloud'
      ? ([
          {
            id: 'invite',
            label: t.invitePeople,
            icon: ShareIcon,
            select: () => {
              if (actions.invite?.kind === 'cloud') void cloud(actions.invite, 'invite');
            },
          },
        ] as const)
      : []),
  ];
  return (
    <>
      <Pressable
        ref={trigger}
        testID="chats-create-fab"
        accessibilityRole="button"
        accessibilityLabel={t.createHere}
        accessibilityState={{ disabled: busy, expanded: open }}
        disabled={busy || open}
        onPress={() => {
          if (opening.current) return;
          opening.current = true;
          haptic('menu');
          setOpen(true);
        }}
        android_ripple={{ color: pressTint(theme.color.accent) }}
        style={({ pressed }) => ({
          width: fab.size,
          height: fab.size,
          borderRadius: android ? fab.radius : radius.round,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: android ? theme.layer.raised.chosen : undefined,
          elevation: android ? fab.elevation : undefined,
          opacity: open ? 0 : pressed ? 0.7 : 1,
        })}
      >
        {!android ? <NavigationMaterial circle /> : null}
        <PlusIcon color={theme.color.fg} size={iconSize} />
      </Pressable>
      {open ? (
        <CreationPanel
          bottom={bottom}
          onDismiss={(action) => {
            opening.current = false;
            setOpen(false);
            if (action) action();
            else
              requestAnimationFrame(() => {
                if (trigger.current)
                  AccessibilityInfo.sendAccessibilityEvent?.(trigger.current, 'focus');
              });
          }}
        >
          {({ dismiss, firstAction }) => (
            <>
              {rows.map(({ id, label, icon: Icon, select }, index) => (
                <CreationRow
                  key={id}
                  focusRef={index === 0 ? firstAction : undefined}
                  testID={`chats-create-${id}`}
                  label={label}
                  description={t.chatsCreate.description[id]}
                  icon={<Icon color={theme.color.fg} size={iconSize} />}
                  onPress={() => dismiss(select)}
                />
              ))}
              {actions.group ? (
                <Pressable
                  ref={rows.length === 0 ? firstAction : undefined}
                  testID="chats-create-group"
                  accessibilityLabel={t.chatsCreate.group}
                  accessibilityRole="button"
                  onPress={() => dismiss(newGroup)}
                  android_ripple={{ color: pressTint(theme.color.onAccent) }}
                  style={({ pressed }) => ({
                    minHeight: theme.touch,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: space.x2,
                    padding: space.x3,
                    backgroundColor: theme.color.accent,
                    borderRadius: radius.lg,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <PlusIcon color={theme.color.onAccent} size={iconSize} />
                  <Text strong style={{ color: theme.color.onAccent, flexShrink: 1 }}>
                    {t.chatsCreate.group}
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </CreationPanel>
      ) : null}
    </>
  );
}
