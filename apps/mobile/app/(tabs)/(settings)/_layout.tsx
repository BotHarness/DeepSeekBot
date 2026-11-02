import { Stack } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';

import { useDesignTheme } from '../../../src/ui/design/theme';
import { TabStack } from '../../../src/ui/shell/tab-stack';
import { useStrings } from '../../../src/ui/strings';

export default function SettingsTabLayout() {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <ThemeProvider value={theme.scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <TabStack background={theme.overlay.fill}>
        <Stack.Screen
          name="settings"
          options={{ title: t.settings, headerLargeStyle: { backgroundColor: 'transparent' } }}
        />
      </TabStack>
    </ThemeProvider>
  );
}
