import { View } from 'react-native';
import {
  NATIVE_SESSION_ATTENTION_KIND,
  type HumanAttentionItem,
  type NativeSessionAttention,
} from '@botharness/host-protocol/wire';
import { useDesignTheme } from '../design/theme';
import { SystemSymbol } from '../primitives/system-symbol';
import type { useStrings } from '../strings';

type Strings = ReturnType<typeof useStrings>;

export function nativeSessionOf(item: HumanAttentionItem): NativeSessionAttention | undefined {
  return item.kind === NATIVE_SESSION_ATTENTION_KIND ? item.nativeSession : undefined;
}

export function nativeSessionName(native: NativeSessionAttention, t: Strings): string {
  return native.sessionTitle ?? t.hostSessions.untitled;
}

export function nativeSessionPreview(
  native: NativeSessionAttention,
  summary: string,
  t: Strings,
): string {
  const need = t.nativeSessionInput[native.input];
  return summary === '' ? need : `${need} · ${summary}`;
}

export function NativeSessionMark({ size, corner }: { size: number; corner: number }) {
  const theme = useDesignTheme();
  return (
    <View
      testID="activity-native-session-mark"
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: corner,
        backgroundColor: theme.color.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <SystemSymbol
        name={{ ios: 'terminal', android: 'terminal' }}
        size={Math.round(size / 2)}
        color={theme.color.muted}
      />
    </View>
  );
}
