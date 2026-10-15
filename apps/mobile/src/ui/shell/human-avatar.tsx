import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { PersonIcon } from './icons';

export function humanInitial(name: string | undefined): string | undefined {
  return Array.from(name?.trim() ?? '')[0]?.toUpperCase();
}

export function HumanAvatarButton({
  loadName,
  onPress,
}: {
  loadName: (() => Promise<string | undefined>) | undefined;
  onPress: () => void;
}) {
  const theme = useDesignTheme();
  const [name, setName] = useState<string>();
  const mount = useMounted<View>(() => {
    let live = true;
    loadName?.().then(
      (loaded) => live && setName(loaded),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [loadName]);
  const size = theme.touch - space.x3;
  const initial = humanInitial(name);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t.settings}
      style={({ pressed }) => ({
        minWidth: theme.touch,
        minHeight: theme.touch,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        ref={mount}
        style={{
          width: size,
          height: size,
          borderRadius: radius.round,
          backgroundColor: theme.layer.raised.fill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {initial === undefined ? (
          <PersonIcon color={theme.color.fg} size={theme.type.title.size} />
        ) : (
          <Text strong>{initial}</Text>
        )}
      </View>
    </Pressable>
  );
}
