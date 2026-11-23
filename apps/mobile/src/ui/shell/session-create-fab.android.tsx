import { Host } from '@expo/ui/jetpack-compose';
import { testID } from '@expo/ui/jetpack-compose/modifiers';
import { useReducedMotion } from 'react-native-reanimated';
import { useDesignTheme } from '../design/theme';
import { fab } from '../design/tokens';
import { useStrings } from '../strings';
import { NativeFabMenu } from './material-fab-menu.android';

export function SessionCreateFab({ onPress }: { onPress(): void }) {
  const theme = useDesignTheme();
  const t = useStrings().hostSessions;
  const reduceMotion = useReducedMotion();
  return (
    <Host
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      style={{ width: fab.size, height: fab.size }}
    >
      <NativeFabMenu
        direct
        modifiers={[testID('session-create-fab')]}
        items={[]}
        expanded={false}
        available
        label={t.create}
        closeLabel={t.create}
        reduceMotion={reduceMotion}
        onToggle={onPress}
        onPick={onPress}
      />
    </Host>
  );
}
