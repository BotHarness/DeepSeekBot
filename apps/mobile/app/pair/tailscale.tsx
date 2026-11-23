import { Stack, useLocalSearchParams } from 'expo-router';

import { Text } from '../../src/ui/primitives/text';
import { PairScanner } from '../../src/ui/shell/pair-scanner';
import { useStrings } from '../../src/ui/strings';

export default function PairTailscaleScreen() {
  const t = useStrings();
  const params = useLocalSearchParams<{ p?: string; mode?: string }>();
  const title =
    params.mode === 'private'
      ? t.pairChoice.private
      : params.mode === 'lan'
        ? t.pairChoice.lan
        : t.pairChoice.tailscale;
  return (
    <>
      <Stack.Screen options={{ title }} />
      <PairScanner
        steps={
          params.mode === 'private'
            ? t.pairChoice.privatePath
            : params.mode === 'lan'
              ? t.pairChoice.lanPath
              : t.pairChoice.tailscalePath
        }
        header={
          params.mode === 'lan' ? null : (
            <Text tone="muted">
              {params.mode === 'private' ? t.pairChoice.privateHint : t.pairChoice.tailscaleHint}
            </Text>
          )
        }
        {...(typeof params.p === 'string' ? { deepLink: params.p } : {})}
      />
    </>
  );
}
