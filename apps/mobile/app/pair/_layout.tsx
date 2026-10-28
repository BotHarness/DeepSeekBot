import { Stack } from 'expo-router';

import { SheetStack } from '../../src/ui/primitives/sheet-stack';
import { useStrings } from '../../src/ui/strings';

export default function PairLayout() {
  const t = useStrings();
  return (
    <SheetStack>
      <Stack.Screen name="index" options={{ title: t.pairTitle }} />
      <Stack.Screen name="account" options={{ title: t.pairChoice.account }} />
      <Stack.Screen name="tailscale" options={{ title: t.pairChoice.tailscale }} />
    </SheetStack>
  );
}
