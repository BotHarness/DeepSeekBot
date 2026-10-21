import { Stack } from 'expo-router';

import { SheetStack } from '../../src/ui/primitives/sheet-stack';
import { t } from '../../src/ui/strings';

export default function PairLayout() {
  return (
    <SheetStack>
      <Stack.Screen name="index" options={{ title: t.pairTitle, headerShown: false }} />
      <Stack.Screen name="account" options={{ title: t.pairChoice.account }} />
      <Stack.Screen name="tailscale" options={{ title: t.pairChoice.tailscale }} />
    </SheetStack>
  );
}
