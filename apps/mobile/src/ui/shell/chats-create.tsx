import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo } from 'react-native';
import { cloudError } from '../../cloud/client';
import { cloudAvailable } from '../../cloud/available';
import { targetsFor, type CreationTarget } from '../../host/creation-targets';
import { useDesignTheme } from '../design/theme';
import { fab } from '../design/tokens';
import { haptic } from '../haptics';
import { showAppDialog } from '../primitives/app-dialog';
import { useStrings } from '../strings';
import { botSourceHref, chatsCreationActions } from './creation-menu-items';
import { CreationPanel } from './creation-panel';
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
import { NavigationAction } from './navigation-action';
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
  const trigger = useRef<ComponentRef<typeof NavigationAction>>(null);
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
  return (
    <>
      <NavigationAction
        ref={trigger}
        testID="chats-create-fab"
        label={t.createHere}
        size={fab.size}
        disabled={busy}
        expanded={open}
        onPress={() => {
          if (opening.current) return;
          opening.current = true;
          haptic('menu');
          setOpen(true);
        }}
      />
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
                          onPress: () =>
                            dismiss(() => router.push(botSourceHref(source, botHostId))),
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
      ) : null}
    </>
  );
}
