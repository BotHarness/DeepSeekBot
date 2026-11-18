import * as Clipboard from 'expo-clipboard';
import { useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { fingerprintRows, fingerprintText } from '../fingerprint-text';
import { haptic } from '../haptics';
import { useStrings } from '../strings';
import { Text } from './text';

const COPIED_MS = 2000;

export function CopyableFingerprint({
  fingerprint,
  label,
  testID,
}: {
  fingerprint: string;
  label?: string | undefined;
  testID: string;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const text = fingerprintText(fingerprint);
  const copy = () =>
    void Clipboard.setStringAsync(text).then(
      () => {
        haptic('selection');
        AccessibilityInfo.announceForAccessibility(t.fingerprintCopied);
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_MS);
      },
      () => undefined,
    );
  return (
    <Pressable
      testID={testID}
      onPress={copy}
      accessibilityRole="button"
      accessibilityLabel={`${label ?? t.copyFingerprint}: ${text}`}
      accessibilityHint={t.fingerprintTapToCopy}
      style={({ pressed }) => ({
        padding: space.x5,
        gap: space.x3,
        borderRadius: radius.lg,
        backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
      })}
    >
      {label ? (
        <Text variant="meta" tone="muted" style={{ textAlign: 'center' }}>
          {label}
        </Text>
      ) : null}
      <View testID={`${testID}-rows`} style={{ gap: space.x1 }}>
        {fingerprintRows(fingerprint).map((row, index) => (
          <Text key={index} style={{ fontFamily: theme.mono, textAlign: 'center' }}>
            {row}
          </Text>
        ))}
      </View>
      <Text
        testID={`${testID}-copy-state`}
        variant="meta"
        tone={copied ? 'accent' : 'muted'}
        style={{ textAlign: 'center' }}
      >
        {copied ? t.fingerprintCopied : t.fingerprintTapToCopy}
      </Text>
    </Pressable>
  );
}
