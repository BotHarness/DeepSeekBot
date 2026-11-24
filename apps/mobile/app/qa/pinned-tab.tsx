import * as Application from 'expo-application';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { IslandFixturePage } from '../../src/features/pinned-tab/island-page';
import { PinnedIsland } from '../../src/features/pinned-tab/prototype-island';
import type {
  PinnedPrototype,
  PinnedTabSlot,
  PinnedTarget,
} from '../../src/features/pinned-tab/prototype-model';
import { useDesignTheme } from '../../src/ui/design/theme';
import { space } from '../../src/ui/design/tokens';
import { Text } from '../../src/ui/primitives/text';
import { useStrings } from '../../src/ui/strings';

const prototypes: readonly PinnedPrototype[] = ['detached', 'item', 'avatar', 'badge', 'island'];

export default function PinnedTabFixtureRoute() {
  if (!__DEV__ || !Application.applicationId?.endsWith('.dev')) return <Redirect href="/" />;
  return <PinnedTabFixture />;
}

function PinnedTabFixture() {
  const t = useStrings();
  const theme = useDesignTheme();
  const params = useLocalSearchParams<{
    prototype?: string;
    selected?: string;
    target?: string;
  }>();
  const fallback: PinnedPrototype = Platform.OS === 'android' ? 'avatar' : 'detached';
  const prototype = prototypes.find((value) => value === params.prototype) ?? fallback;
  if (prototype === 'island')
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <IslandFixturePage key={`${params.selected ?? ''}-${params.target ?? ''}`} />
      </>
    );
  const steward: PinnedTarget = {
    kind: 'bot',
    slug: 'fixture-steward',
    name: t.pinnedTabFixture.stewardName,
    unread: 0,
  };
  const cases: { key: string; title: string; target: PinnedTarget; selected: PinnedTabSlot }[] = [
    {
      key: 'selected',
      title: t.pinnedTabFixture.pinnedSelected,
      target: steward,
      selected: 'pinned',
    },
    {
      key: 'unselected',
      title: t.pinnedTabFixture.chatsSelected,
      target: steward,
      selected: 'chats',
    },
    {
      key: 'channel',
      title: t.pinnedTabFixture.channelUnread,
      target: { kind: 'channel', name: t.pinnedTabFixture.channelName, unread: 3 },
      selected: 'chats',
    },
  ];
  return (
    <ScrollView
      testID={`pinned-fixture-${prototype}`}
      style={{ flex: 1, backgroundColor: theme.color.base }}
      contentContainerStyle={{ paddingVertical: space.x5, gap: space.x6 }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen options={{ title: t.pinnedTabFixture.title }} />
      {cases.map(({ key, ...item }) => (
        <FixtureCase key={`${prototype}-${key}`} {...item} prototype={prototype} />
      ))}
    </ScrollView>
  );
}

function FixtureCase({
  title,
  target,
  selected: initial,
  prototype,
}: {
  title: string;
  target: PinnedTarget;
  selected: PinnedTabSlot;
  prototype: PinnedPrototype;
}) {
  const [selected, setSelected] = useState(initial);
  return (
    <View style={{ gap: space.x3 }}>
      <Text variant="meta" tone="muted" style={{ paddingHorizontal: space.x5 }}>
        {title}
      </Text>
      <PinnedIsland
        prototype={prototype}
        target={target}
        selected={selected}
        onSelect={setSelected}
      />
    </View>
  );
}
