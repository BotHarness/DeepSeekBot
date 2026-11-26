import { Fragment } from 'react';
import { View } from 'react-native';
import { turnTargetLabel, type TurnTargetCatalog } from '@botharness/host-client/turn-target';
import type { TurnModelSwitch, TurnTarget } from '@botharness/host-protocol/turn-target';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { ModelBrandIcon } from './model-brand-icon';

export function TurnModelSwitchMarker({
  change,
  catalog,
  showRouteKinds = true,
}: {
  change: TurnModelSwitch;
  catalog?: TurnTargetCatalog | undefined;
  showRouteKinds?: boolean;
}) {
  const t = useStrings().turnModel;
  const theme = useDesignTheme();
  const from = turnTargetLabel(change.from, catalog);
  const to = turnTargetLabel(change.to, catalog);
  const line = t[change.reason ?? 'switched'];
  const route = (target: TurnTarget) => (target.kind === 'engine' ? t.sub : t.api);
  const name = (target: TurnTarget, short: string) =>
    showRouteKinds ? `${short} ${route(target)}` : short;
  const model = (target: TurnTarget, label: ReturnType<typeof turnTargetLabel>) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x1 }}>
      <ModelBrandIcon
        brand={label.brand}
        size={theme.type.meta.size * theme.fontScale}
        color={theme.color.muted}
      />
      <Text variant="meta" tone="muted">
        {label.short}
      </Text>
      {showRouteKinds ? (
        <Text variant="meta" tone="muted">
          {route(target)}
        </Text>
      ) : null}
    </View>
  );
  return (
    <View
      testID="turn-model-switch"
      accessible
      accessibilityLabel={line(name(change.from, from.short), name(change.to, to.short))}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        padding: space.x2,
      }}
    >
      {line('\u0000from\u0000', '\u0000to\u0000')
        .split('\u0000')
        .map((part, index) => (
          <Fragment key={index}>
            {part === 'from' ? (
              model(change.from, from)
            ) : part === 'to' ? (
              model(change.to, to)
            ) : (
              <Text variant="meta" tone="muted">
                {part}
              </Text>
            )}
          </Fragment>
        ))}
    </View>
  );
}
