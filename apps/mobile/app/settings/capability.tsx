import { useLocalSearchParams } from 'expo-router';

import type { BotAccessKind } from '../../src/host/bot-access';
import { BotCapabilityScreen } from '../../src/ui/shell/bot-capability-screen';

export default function CapabilityRoute() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const access: BotAccessKind = kind === 'browser' ? 'browser' : 'computer';
  return <BotCapabilityScreen kind={access} />;
}
