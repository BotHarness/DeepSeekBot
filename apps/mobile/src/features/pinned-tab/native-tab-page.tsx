import { View } from 'react-native';
import { useDesignTheme } from '../../ui/design/theme';
import { space } from '../../ui/design/tokens';
import { Text } from '../../ui/primitives/text';
import { PinnedAvatar } from './pinned-avatar';

export function NativeTabPage({ title, avatar = false }: { title: string; avatar?: boolean }) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.x4,
        padding: space.x5,
        backgroundColor: theme.color.base,
      }}
    >
      {avatar ? (
        <PinnedAvatar
          target={{ kind: 'bot', slug: 'fixture-steward', name: title, unread: 0 }}
          size={theme.touch * 2}
          selected={false}
          ring={false}
        />
      ) : null}
      <Text variant="title">{title}</Text>
    </View>
  );
}
