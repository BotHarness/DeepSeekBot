import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useStrings } from '../strings';
import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from './text';
import { Button } from './button';

export function ReadFailure({
  title,
  detail,
  onRetry,
  busy = false,
  disabled = false,
}: {
  title: string;
  detail?: string | undefined;
  onRetry(): void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={{ gap: space.x3 }}>
      <Text accessibilityRole="alert" tone="danger">
        {title}
      </Text>
      {detail ? (
        <View style={{ gap: space.x2 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.details}
            accessibilityState={{ expanded }}
            onPress={() => setExpanded((value) => !value)}
            style={{ minHeight: theme.touch, justifyContent: 'center' }}
          >
            <Text tone="muted">{t.details}</Text>
          </Pressable>
          {expanded ? (
            <Text selectable variant="meta">
              {detail}
            </Text>
          ) : null}
        </View>
      ) : null}
      <Button
        symbol="refresh"
        label={t.tryAgain}
        disabled={disabled}
        busy={busy}
        onPress={onRetry}
      />
    </View>
  );
}
