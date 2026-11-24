import { useState } from 'react';
import { PixelRatio, View, type ImageSourcePropType, type ViewInstance } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { navigationBar } from '../../ui/design/tokens';
import { useMounted } from '../../ui/mounted';
import { PinnedAvatar } from './pinned-avatar';
import type { PinnedTarget } from './prototype-model';

export type AvatarIcons = { default: ImageSourcePropType; selected: ImageSourcePropType };

export function useAvatarIcons(target: PinnedTarget, enabled: boolean) {
  const [plainUri, setPlainUri] = useState<string>();
  const [ringUri, setRingUri] = useState<string>();
  const plain = useCapture(enabled, setPlainUri);
  const ringed = useCapture(enabled, setRingUri);
  const scale = PixelRatio.get();
  const icons: AvatarIcons | undefined =
    plainUri !== undefined && ringUri !== undefined
      ? { default: { uri: plainUri, scale }, selected: { uri: ringUri, scale } }
      : undefined;
  const capture = enabled ? (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', left: -navigationBar.height * 4, top: 0 }}
    >
      {[plain, ringed].map((ref, index) => (
        <View key={index} ref={ref} collapsable={false}>
          <PinnedAvatar
            target={{ ...target, unread: 0 }}
            size={navigationBar.symbolBox}
            selected={index === 1}
            ring={index === 1}
            unread={false}
          />
        </View>
      ))}
    </View>
  ) : null;
  return { icons, capture, key: `${plainUri ?? ''}-${ringUri ?? ''}` };
}

function useCapture(enabled: boolean, done: (uri: string) => void) {
  return useMounted<ViewInstance>(
    (view) => {
      if (!enabled) return;
      let live = true;
      const timer = setTimeout(() => {
        void captureRef(view, { format: 'png', quality: 1, result: 'tmpfile' }).then((uri) => {
          if (live) done(uri);
        });
      }, 300);
      return () => {
        live = false;
        clearTimeout(timer);
      };
    },
    [enabled],
  );
}
