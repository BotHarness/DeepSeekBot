import { View } from 'react-native';
import type { TurnTarget } from '@botharness/host-protocol/turn-target';
import { turnTargetLabel, type TurnTargetCatalog } from '@botharness/host-client/turn-target';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { ModelTargetIcon } from './model-target-icon';

export function MessageMenuHeader({
  time,
  targets,
  catalog,
}: {
  time: string;
  targets: readonly TurnTarget[];
  catalog: TurnTargetCatalog | undefined;
}) {
  const theme = useDesignTheme();
  const t = useStrings();
  const labels = targets.map((target) =>
    turnTargetLabel(target, catalog, t.routingGroup.engineRow),
  );
  const path = labels
    .map((label) =>
      label.external ? `${label.name}, ${t.routingGroup.externalEngine}` : label.name,
    )
    .join(t.messageTargetSeparator);
  const iconSize = theme.type.meta.line * theme.fontScale;
  return (
    <View
      style={{
        width: '100%',
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        columnGap: space.x3,
        rowGap: space.x1,
      }}
    >
      {time === '' ? null : (
        <Text testID="message-menu-time" variant="meta" tone="muted" style={{ maxWidth: '100%' }}>
          {time}
        </Text>
      )}
      <View
        testID="message-menu-turn-targets"
        accessible
        accessibilityRole="text"
        accessibilityLabel={t.messageRanOn(path)}
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          maxWidth: '100%',
          marginStart: 'auto',
          columnGap: space.x2,
          rowGap: space.x1,
        }}
      >
        {labels.map((label, index) => (
          <View
            key={index}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2, maxWidth: '100%' }}
          >
            {index === 0 ? null : (
              <Text variant="meta" tone="muted">
                →
              </Text>
            )}
            <ModelTargetIcon target={label} size={iconSize} color={theme.color.muted} />
            <Text variant="meta" tone="muted" style={{ flexShrink: 1, textAlign: 'right' }}>
              {[label.short, label.effort].filter(Boolean).join(' · ')}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
