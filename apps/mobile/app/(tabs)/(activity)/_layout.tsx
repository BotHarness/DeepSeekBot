import { Stack } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';

import { useDesignTheme } from '../../../src/ui/design/theme';
import { sessionRouteOptions, TabStack } from '../../../src/ui/shell/tab-stack';

export const unstable_settings = { initialRouteName: 'activity' };

export default function ActivityLayout() {
  const theme = useDesignTheme();
  return (
    <ThemeProvider value={theme.scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <TabStack>
        <Stack.Screen name="activity" />
        <Stack.Screen name="activity/session/[id]" options={sessionRouteOptions} />
      </TabStack>
    </ThemeProvider>
  );
}
