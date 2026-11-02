import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';

import { useDesignTheme } from '../../../src/ui/design/theme';
import { TabStack } from '../../../src/ui/shell/tab-stack';

export default function ActivityLayout() {
  const theme = useDesignTheme();
  return (
    <ThemeProvider value={theme.scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <TabStack />
    </ThemeProvider>
  );
}
