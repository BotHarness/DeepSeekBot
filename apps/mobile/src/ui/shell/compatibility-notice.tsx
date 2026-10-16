import { View } from 'react-native';
import type { Compatibility } from '../../host/compatibility';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { SettingsRow } from '../primitives/settings-row';
import { t } from '../strings';

export function compatibilityDetail(info: Compatibility): string {
  if (info.status === 'unverified') return t.compatibilityUnknown;
  if (info.status === 'incompatible') return t.compatibilityBlocked;
  return info.features.push
    ? t.compatibilityProtocol
    : `${t.compatibilityProtocol} ${t.pushFailed['push-unsupported']}`;
}

export function CompatibilityNotice({ info, onRetry }: { info: Compatibility; onRetry(): void }) {
  return (
    <View accessibilityRole="alert" style={{ padding: space.x4, gap: space.x2 }}>
      <Text strong>{t.compatibility}</Text>
      <Text variant="meta" tone={info.status === 'incompatible' ? 'danger' : 'muted'}>
        {compatibilityDetail(info)}
      </Text>
      {info.status === 'incompatible' ? <SettingsRow title={t.retry} onPress={onRetry} /> : null}
    </View>
  );
}
