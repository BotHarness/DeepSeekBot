import { useRef, useState } from 'react';
import { PixelRatio, View, type ViewInstance } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import type { Conversation } from '../../ui/chat/conversations';
import { useDesignTheme } from '../../ui/design/theme';
import { navigationBar, pinnedTabIcon } from '../../ui/design/tokens';
import { useMounted } from '../../ui/mounted';
import { PinnedAvatar } from './pinned-avatar';

export type AvatarIcon = { uri: string; scale: number };
export type AvatarIcons = { default: AvatarIcon; selected: AvatarIcon };

export function avatarIconKey(scheme: string, conversation: Conversation | undefined): string {
  if (conversation === undefined) return `${scheme}:none`;
  const face =
    conversation.kind === 'bot'
      ? [
          conversation.bot.displayName,
          conversation.bot.avatarUrl,
          conversation.bot.appearance,
          conversation.bot.primaryColor,
          conversation.bot.paused,
        ]
      : [conversation.channel.name, conversation.channel.avatar];
  return JSON.stringify([scheme, conversation.key, ...face]);
}

export function useAvatarIcons(conversation: Conversation | undefined, size: number) {
  const theme = useDesignTheme();
  const key = avatarIconKey(theme.scheme, conversation);
  const [shots, setShots] = useState<{ key: string; plain?: string; ring?: string }>({ key });
  const shot = (field: 'plain' | 'ring') => (uri: string) =>
    setShots((previous) =>
      previous.key === key ? { ...previous, [field]: uri } : { key, [field]: uri },
    );
  const plain = useCapture(key, shot('plain'));
  const ringed = useCapture(key, shot('ring'));
  const scale = PixelRatio.get();
  const current = shots.key === key ? shots : { key };
  const icons: AvatarIcons | undefined =
    current.plain !== undefined && current.ring !== undefined
      ? { default: { uri: current.plain, scale }, selected: { uri: current.ring, scale } }
      : undefined;
  const capture = (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ position: 'absolute', left: -navigationBar.height * 4, top: 0 }}
    >
      {[plain, ringed].map((ref, index) => (
        <View key={`${key}:${index}`} ref={ref.mount} collapsable={false}>
          <PinnedAvatar
            conversation={conversation}
            size={size}
            selected={index === 1}
            onSettled={ref.again}
          />
        </View>
      ))}
    </View>
  );
  return { icons, capture };
}

function useCapture(key: string, done: (uri: string) => void) {
  const view = useRef<ViewInstance | undefined>(undefined);
  const live = useRef(false);
  const shoot = (target: ViewInstance) =>
    captureRef(target, { format: 'png', quality: 1, result: 'tmpfile' }).then(
      (uri) => {
        if (live.current && view.current === target) done(uri);
      },
      () => undefined,
    );
  const mount = useMounted<ViewInstance>(
    (target) => {
      view.current = target;
      live.current = true;
      const timers = pinnedTabIcon.captureDelays.map((delay) =>
        setTimeout(() => void shoot(target), delay),
      );
      return () => {
        live.current = false;
        view.current = undefined;
        for (const timer of timers) clearTimeout(timer);
      };
    },
    [key],
  );
  const again = () => {
    const target = view.current;
    if (target !== undefined) requestAnimationFrame(() => void shoot(target));
  };
  return { mount, again };
}
