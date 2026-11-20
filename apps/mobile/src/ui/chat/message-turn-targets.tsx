import { View } from 'react-native';
import type { TurnTarget } from '@botharness/host-protocol/turn-target';
import { turnTargetLabel } from '@botharness/host-client/turn-target';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { EngineBrandIcon } from './engine-brand-icon';
import { ModelBrandIcon } from './model-brand-icon';

export function MessageTurnTargets({ targets }: { targets: readonly TurnTarget[] }) {
  const theme = useDesignTheme();
  const t = useStrings();
  return (
    <View testID="message-menu-turn-targets" style={{ gap: space.x1 }}>
      {targets.map((target, index) => {
        const label = turnTargetLabel(target);
        return (
          <View
            key={index}
            accessible
            accessibilityLabel={[
              label.name,
              label.external ? t.routingGroup.externalEngine : undefined,
            ]
              .filter(Boolean)
              .join(', ')}
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.x2 }}
          >
            {index === 0 ? null : (
              <Text variant="meta" tone="muted">
                →
              </Text>
            )}
            {label.external ? (
              <EngineBrandIcon
                brand={label.brand}
                size={theme.type.meta.line}
                color={theme.color.muted}
              />
            ) : (
              <ModelBrandIcon
                brand={label.brand}
                size={theme.type.meta.line}
                color={theme.color.muted}
              />
            )}
            <Text variant="meta" tone="muted" style={{ flexShrink: 1 }}>
              {label.short}
            </Text>
            {target.kind === 'engine' && target.reasoningEffort !== undefined ? (
              <Text variant="meta" tone="muted">
                {target.reasoningEffort}
              </Text>
            ) : null}
            {label.external ? (
              <View
                style={{
                  borderRadius: radius.round,
                  backgroundColor: theme.layer.raised.inset,
                  paddingHorizontal: space.x2,
                }}
              >
                <Text variant="meta" tone="muted">
                  {t.routingGroup.externalEngine}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
