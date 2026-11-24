import { Stack } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { useDesignTheme } from '../../../src/ui/design/theme';
import { sessionRouteOptions, TabStack } from '../../../src/ui/shell/tab-stack';

export const unstable_settings = { initialRouteName: 'sessions' };

export default function SessionsLayout() {
  const theme = useDesignTheme();
  return (
    <ThemeProvider value={theme.scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <TabStack>
        <Stack.Screen name="sessions" />
        <Stack.Screen name="session/[id]" options={sessionRouteOptions} />
      </TabStack>
    </ThemeProvider>
  );
}
