import { Image } from 'expo-image';
import { memo, useState } from 'react';
import { View } from 'react-native';
import type { BackgroundChoice } from '../../host/chat-background';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';

export const ChatBackground = memo(function ChatBackground({
  choice,
  imageUri,
}: {
  choice: BackgroundChoice;
  imageUri(id: string): string;
}) {
  const theme = useDesignTheme();
  const [failed, setFailed] = useState<string>();
  const missing = choice.kind === 'image' && failed === choice.id;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: choice.kind === 'color' ? choice.color : theme.color.base,
      }}
    >
      {choice.kind !== 'image' || missing ? null : (
        <>
          <Image
            source={{ uri: imageUri(choice.id) }}
            contentFit={choice.fit}
            contentPosition={{ left: `${choice.x * 100}%`, top: `${choice.y * 100}%` }}
            autoplay={false}
            transition={0}
            onError={() => setFailed(choice.id)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: theme.color.base,
              opacity: choice.fade / 100,
            }}
          />
        </>
      )}
      {missing ? (
        <Text
          variant="meta"
          tone="warning"
          accessibilityRole="alert"
          style={{
            padding: space.x5,
            marginTop: space.x6 * 4,
            backgroundColor: theme.layer.raised.fill,
          }}
        >
          {t.chatBackground.missing}
        </Text>
      ) : null}
    </View>
  );
});
