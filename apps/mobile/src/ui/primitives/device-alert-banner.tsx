import { useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { alertBanners } from '../../host/alert-banners';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { useStrings } from '../strings';
import { Button } from './button';
import { Text } from './text';

export function DeviceAlertBanner() {
  const alert = useSyncExternalStore(alertBanners.subscribe, alertBanners.getSnapshot);
  const theme = useDesignTheme();
  const t = useStrings();
  if (!alert) return null;
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: theme.color.elevated }}>
      <View
        accessibilityLiveRegion="polite"
        testID="device-alert-banner"
        style={{ padding: space.x4, gap: space.x3 }}
      >
        <Text strong>{alert.title}</Text>
        <Text>{alert.body}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x3 }}>
          <Button
            label={t.alertOpen}
            onPress={alertBanners.open}
            testID="device-alert-open"
            variant="text"
          />
          <Button
            label={t.alertDismiss}
            onPress={alertBanners.dismiss}
            testID="device-alert-dismiss"
            variant="text"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
