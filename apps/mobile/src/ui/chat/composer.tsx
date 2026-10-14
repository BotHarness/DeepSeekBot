import { Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { ArrowUpIcon } from '../shell/icons';
import { t } from '../strings';

export function Composer({
  value,
  placeholder,
  disabled,
  onChange,
  onSend,
}: {
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange(next: string): void;
  onSend(): void;
}) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const ready = value.trim() !== '' && !disabled;
  const button = theme.touch - space.x4;
  return (
    <View
      style={{
        paddingHorizontal: space.x4,
        paddingTop: space.x3,
        paddingBottom: Math.max(insets.bottom, space.x3),
        backgroundColor: theme.color.base,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: space.x3,
          minHeight: theme.touch,
          paddingLeft: space.x5,
          paddingRight: space.x2,
          paddingVertical: space.x2,
          borderRadius: radius.lg + space.x3,
          borderWidth: edge.hairline,
          borderColor: theme.color.borderStrong,
          backgroundColor: theme.color.surface,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={theme.color.subtle}
          accessibilityLabel={placeholder}
          multiline
          style={{
            flex: 1,
            maxHeight: theme.touch * 3,
            minHeight: button,
            paddingVertical: space.x3,
            color: theme.color.fg,
            fontSize: theme.type.body.size,
            lineHeight: theme.type.body.line,
          }}
        />
        {ready ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.send}
            onPress={onSend}
            hitSlop={space.x2}
            style={({ pressed }) => ({
              width: button,
              height: button,
              borderRadius: radius.round,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.color.accent,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <ArrowUpIcon color={theme.color.onAccent} size={theme.type.title.line} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
