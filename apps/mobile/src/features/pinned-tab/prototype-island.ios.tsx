import { Button, Host, HStack, Image, RNHostView, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  accessibilityElement,
  accessibilityHidden,
  accessibilityLabel,
  background,
  buttonBorderShape,
  buttonStyle,
  dynamicTypeSize,
  font,
  foregroundStyle,
  frame,
  glassEffect,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDesignTheme } from '../../ui/design/theme';
import { navigationBar, space } from '../../ui/design/tokens';
import { tabSymbols } from '../../ui/shell/navigation-destinations.ios';
import { useStrings } from '../../ui/strings';
import { badgeCount } from '../../ui/primitives/badge-count';
import { PinnedAvatar } from './pinned-avatar';
import { pinnedTabOrder, type PinnedIslandProps, type PinnedTabSlot } from './prototype-model';

type GlyphSlot = Exclude<PinnedTabSlot, 'pinned'>;

const symbolBox = frame({
  maxWidth: Infinity,
  minHeight: navigationBar.symbolBox,
  maxHeight: navigationBar.symbolBox,
});

export function PinnedIsland({ prototype, target, selected, onSelect }: PinnedIslandProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const glass = Number.parseInt(String(Platform.Version), 10) >= 26;
  const detached = prototype === 'detached';
  const label = (slot: PinnedTabSlot) =>
    slot === 'pinned'
      ? [
          t.pinnedTabFixture.tabLabel(target.name),
          ...(target.unread > 0 ? [t.pinnedTabFixture.unread(badgeCount(target.unread))] : []),
        ].join(', ')
      : slot === 'chats'
        ? t.chats
        : slot === 'activity'
          ? t.activity
          : slot === 'sessions'
            ? t.hostSessions.title
            : t.settings;
  const traits = (slot: PinnedTabSlot) =>
    accessibilityAddTraits(slot === selected ? ['isButton', 'isSelected'] : ['isButton']);
  const glyph = (slot: GlyphSlot) => {
    const [outline, filled] = tabSymbols[slot];
    return (
      <Button
        key={slot}
        testID={`pinned-fixture-${slot}`}
        onPress={() => onSelect(slot)}
        modifiers={[
          buttonStyle('plain'),
          background(navigationBar.hitFill, shapes.capsule()),
          frame({ maxWidth: Infinity, maxHeight: Infinity }),
          accessibilityElement('ignore'),
          accessibilityLabel(label(slot)),
          traits(slot),
          foregroundStyle(slot === selected ? theme.color.fg : theme.color.muted),
        ]}
      >
        <VStack
          modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity, minHeight: theme.touch })]}
        >
          <Image
            systemName={slot === selected ? filled : outline}
            modifiers={[
              font({ textStyle: 'title2' }),
              dynamicTypeSize({ max: 'xxxLarge' }),
              symbolBox,
              accessibilityHidden(),
            ]}
          />
        </VStack>
      </Button>
    );
  };
  const pinnedItem = (
    <Button
      key="pinned"
      testID="pinned-fixture-pinned"
      onPress={() => onSelect('pinned')}
      modifiers={[
        buttonStyle('plain'),
        background(navigationBar.hitFill, shapes.capsule()),
        frame({ maxWidth: Infinity, maxHeight: Infinity }),
        accessibilityElement('ignore'),
        accessibilityLabel(label('pinned')),
        traits('pinned'),
      ]}
    >
      <VStack
        modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity, minHeight: theme.touch })]}
      >
        <RNHostView matchContents>
          <PinnedAvatar
            target={target}
            size={navigationBar.symbolBox + space.x3}
            selected={selected === 'pinned'}
          />
        </RNHostView>
      </VStack>
    </Button>
  );
  const slots = pinnedTabOrder.filter((slot) => !detached || slot !== 'pinned');
  const circle = navigationBar.height;
  return (
    <View
      style={{
        height: navigationBar.height,
        paddingLeft: insets.left + space.x5,
        paddingRight: insets.right + space.x5,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        backgroundColor: theme.color.base,
      }}
    >
      <Host
        key={`${theme.scheme}-${prototype}`}
        style={{ flex: 1, height: navigationBar.height }}
        colorScheme={theme.scheme}
      >
        <HStack
          spacing={space.x2}
          modifiers={[
            frame({ maxWidth: Infinity, maxHeight: Infinity }),
            accessibilityAddTraits(['isTabBar']),
          ]}
        >
          {slots.map((slot) => (slot === 'pinned' ? pinnedItem : glyph(slot)))}
        </HStack>
      </Host>
      {detached ? (
        <Host
          key={`${theme.scheme}-circle`}
          style={{ width: circle, height: circle }}
          colorScheme={theme.scheme}
        >
          <Button
            testID="pinned-fixture-pinned"
            onPress={() => onSelect('pinned')}
            modifiers={[
              buttonStyle('plain'),
              buttonBorderShape('circle'),
              ...(glass
                ? [
                    glassEffect({
                      glass: { variant: 'regular', interactive: true },
                      shape: 'circle',
                    }),
                  ]
                : [background(theme.layer.raised.fill, shapes.circle())]),
              frame({ width: circle, height: circle }),
              accessibilityElement('ignore'),
              accessibilityLabel(label('pinned')),
              traits('pinned'),
            ]}
          >
            <RNHostView matchContents>
              <PinnedAvatar
                target={target}
                size={circle - space.x5}
                selected={selected === 'pinned'}
              />
            </RNHostView>
          </Button>
        </Host>
      ) : null}
    </View>
  );
}
