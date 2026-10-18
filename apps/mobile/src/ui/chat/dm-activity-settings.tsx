import { Platform, View } from 'react-native';

import { dmActivityPreferences, useHiddenDmActivity } from '../../host/native-dm-activity';
import { useDesignTheme } from '../design/theme';
import { edge, space } from '../design/tokens';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { Toggle } from '../primitives/toggle';
import { t } from '../strings';
import { SHEET_GROUP } from './sheet';

export function DmActivitySettings({
  hostId,
  botSlug,
  name,
}: {
  hostId: string;
  botSlug: string;
  name: string;
}) {
  const hidden = useHiddenDmActivity(hostId, botSlug);
  const theme = useDesignTheme();
  const android = Platform.OS === 'android';
  const on = android ? SHEET_GROUP : 'sheet';
  return (
    <SettingsSection title={t.activityRow.show} footer={t.activityRow.footnote(name)} on={on}>
      {(['posts', 'memory'] as const).map((kind) => {
        const label = kind === 'posts' ? t.activityRow.posts : t.activityRow.updates;
        const toggle = (
          <Toggle
            on={on}
            label={label}
            value={!hidden.includes(kind)}
            onChange={(shown) => dmActivityPreferences.setHidden(hostId, botSlug, kind, !shown)}
          />
        );
        if (android) return <SettingsRow key={kind} title={label} trailing={toggle} on={on} />;
        return (
          <View
            key={kind}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.x4,
              minHeight: theme.touch,
              paddingHorizontal: space.x5,
              paddingVertical: space.x3,
              borderTopWidth: kind === 'memory' ? edge.hairline : 0,
              borderTopColor: theme.layer.sheet.divider,
            }}
          >
            <Text style={{ flex: 1 }}>{label}</Text>
            {toggle}
          </View>
        );
      })}
    </SettingsSection>
  );
}
