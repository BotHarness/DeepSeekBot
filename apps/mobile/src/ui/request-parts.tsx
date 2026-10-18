import { Text } from './primitives/system-text';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { t } from './strings';
import { useTheme } from './theme';

export type NoticeTone = 'success' | 'warning' | 'danger';

export function Notice({ tone, children }: { tone: NoticeTone; children: ReactNode }) {
  const theme = useTheme();
  const colors = {
    success: { ink: theme.brand, surface: theme.surface },
    warning: { ink: theme.warning, surface: theme.warningSurface },
    danger: { ink: theme.danger, surface: theme.dangerSurface },
  }[tone];
  return (
    <View
      accessibilityRole="alert"
      testID={`notice-${tone}`}
      style={{
        backgroundColor: colors.surface,
        borderColor: theme.border,
        borderWidth: tone === 'success' ? 1 : 0,
        borderRadius: 10,
        padding: 12,
      }}
    >
      <Text style={{ color: colors.ink, fontSize: 15 }}>{children}</Text>
    </View>
  );
}

export function ActionButton({
  label,
  onPress,
  tone = 'primary',
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
}) {
  const theme = useTheme();
  const filled = tone === 'primary';
  const ink = filled ? theme.onAccent : tone === 'danger' ? theme.danger : theme.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        paddingHorizontal: 16,
        backgroundColor: filled ? theme.accent : theme.surface,
        borderWidth: filled ? 0 : 1,
        borderColor: theme.border,
        opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator color={ink} />
      ) : (
        <Text style={{ color: ink, fontSize: 16, fontWeight: '600' }}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Loading() {
  return (
    <View style={{ padding: 32, alignItems: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}

export function LoadFailed({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Notice tone="danger">{`${t.loadFailed} ${error}`}</Notice>
      <View style={{ flexDirection: 'row' }}>
        <ActionButton label={t.tryAgain} tone="secondary" onPress={onRetry} />
      </View>
    </View>
  );
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
