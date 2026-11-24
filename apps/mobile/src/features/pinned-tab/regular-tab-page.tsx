import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useDesignTheme } from '../../ui/design/theme';
import { space } from '../../ui/design/tokens';
import { Button } from '../../ui/primitives/button';
import { Text } from '../../ui/primitives/text';
import { useStrings } from '../../ui/strings';
import { PinnedAvatar } from './pinned-avatar';
import type { PinnedTarget } from './prototype-model';
import { useFixtureTabOrder } from './tab-order';

const rows = Array.from({ length: 60 }, (_, index) => index + 1);

export function RegularTabPage({
  title,
  target,
  slot,
}: {
  title: string;
  target?: PinnedTarget | undefined;
  slot: string;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const order = useFixtureTabOrder();
  const [taps, setTaps] = useState(0);
  const header = (
    <View style={{ alignItems: 'center', gap: space.x4, padding: space.x5 }}>
      {target === undefined ? null : (
        <PinnedAvatar target={target} size={theme.touch * 2} selected={false} ring={false} />
      )}
      <Text variant="title">{title}</Text>
      <Text testID={`regular-fixture-taps-${slot}`}>{t.pinnedTabFixture.taps(taps)}</Text>
      {order.picked === undefined ? null : (
        <Text testID="regular-fixture-picked">{t.pinnedTabFixture.picked(order.picked)}</Text>
      )}
      <Button
        testID={`regular-fixture-tap-${slot}`}
        label={t.pinnedTabFixture.countTap}
        onPress={() => setTaps((value) => value + 1)}
      />
      <Button
        testID={`regular-fixture-order-${slot}`}
        label={order.swapped ? t.pinnedTabFixture.restoreOrder : t.pinnedTabFixture.swapOrder}
        onPress={order.toggle}
      />
    </View>
  );
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.color.base }}
      contentInsetAdjustmentBehavior="automatic"
      scrollEventThrottle={16}
      onScroll={
        order.scrolled === undefined
          ? undefined
          : ({ nativeEvent }) => order.scrolled?.(nativeEvent.contentOffset.y)
      }
      data={rows}
      keyExtractor={(row) => String(row)}
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <Text tone="muted" style={{ paddingHorizontal: space.x5, paddingVertical: space.x4 }}>
          {t.pinnedTabFixture.row(item)}
        </Text>
      )}
    />
  );
}
