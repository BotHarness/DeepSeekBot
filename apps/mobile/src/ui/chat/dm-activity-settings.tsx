import { View } from 'react-native';

import { dmActivityPreferences, useHiddenDmActivity } from '../../host/native-dm-activity';
import { useDesignTheme } from '../design/theme';
import { edge, space } from '../design/tokens';
import { SettingsSection } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { Toggle } from '../primitives/toggle';
import { t } from '../strings';

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
  return (
    <SettingsSection title={t.activityRow.show} footer={t.activityRow.footnote(name)}>
      {(['posts', 'memory'] as const).map((kind) => {
        const label = kind === 'posts' ? t.activityRow.posts : t.activityRow.updates;
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
            <Toggle
              label={label}
              value={!hidden.includes(kind)}
              onChange={(shown) => dmActivityPreferences.setHidden(hostId, botSlug, kind, !shown)}
            />
          </View>
        );
      })}
    </SettingsSection>
  );
}
