import { useState } from 'react';
import { Animated, I18nManager, Pressable, View } from 'react-native';
import type { SceneRendererProps } from 'react-native-tab-view';
import { GestureDetector } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space, tabLabel, tabMotion } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import type { ActivitySection } from './activity-filters';
import {
  ACTIVITY_TABS,
  activityDotColor,
  activityStripSwipe,
  type ActivityTab,
  type ActivityTabMarks,
} from './activity-tab-strip';
import { ActivityIcon, PersonIcon } from './icons';

export { ACTIVITY_TABS, type ActivityTab } from './activity-tab-strip';
const ICONS = { action: ActivityIcon, replies: PersonIcon };

export function ActivityTabs({
  selected,
  marks,
  position,
  onSelect,
}: {
  selected: ActivitySection;
  marks: ActivityTabMarks;
  position: SceneRendererProps['position'];
  onSelect(section: ActivityTab['key']): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const [width, setWidth] = useState(0);
  const tabWidth = width / ACTIVITY_TABS.length;
  const iconSize = theme.type.body.line;
  const reducedMotion = useReducedMotion();
  const showIcons = ACTIVITY_TABS.some((tab) => tab.key === selected);
  const direction = I18nManager.isRTL ? -1 : 1;
  const inactiveOffset = (-(iconSize + space.x2) / 2) * direction;
  const swipe = activityStripSwipe(selected, tabWidth, onSelect);
  return (
    <GestureDetector gesture={swipe}>
      <View
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{ backgroundColor: theme.color.base }}
      >
        <View style={{ flexDirection: 'row' }}>
          {ACTIVITY_TABS.map(({ key }, index) => {
            const Icon = ICONS[key];
            const inputRange = [index - 1, index, index + 1];
            const animate = showIcons && !reducedMotion;
            const focused = showIcons && selected === key;
            return (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityLabel={t.inboxSections[key]}
                {...(marks[key] ? { accessibilityValue: { text: t.activityTabNewValue } } : {})}
                accessibilityState={{ selected: selected === key }}
                onPress={() => onSelect(key)}
                android_ripple={{ color: theme.layer.canvas.pressed }}
                style={({ pressed }) => ({
                  flex: 1,
                  minWidth: 0,
                  minHeight: theme.touch,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: space.x2,
                  paddingVertical: space.x4,
                  backgroundColor: pressed ? theme.layer.canvas.pressed : theme.color.base,
                })}
              >
                <Animated.View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: space.x2,
                    transform: [
                      {
                        translateX: animate
                          ? position.interpolate({
                              inputRange,
                              outputRange: [inactiveOffset, 0, inactiveOffset],
                              extrapolate: 'clamp',
                            })
                          : focused
                            ? 0
                            : inactiveOffset,
                      },
                    ],
                  }}
                >
                  <Animated.View
                    pointerEvents="none"
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={{
                      width: iconSize,
                      height: iconSize,
                      opacity: animate
                        ? position.interpolate({
                            inputRange,
                            outputRange: [0, 1, 0],
                            extrapolate: 'clamp',
                          })
                        : focused
                          ? 1
                          : 0,
                      transform: [
                        {
                          scale: animate
                            ? position.interpolate({
                                inputRange,
                                outputRange: [
                                  tabMotion.inactiveIconScale,
                                  1,
                                  tabMotion.inactiveIconScale,
                                ],
                                extrapolate: 'clamp',
                              })
                            : 1,
                        },
                        {
                          translateX: animate
                            ? position.interpolate({
                                inputRange,
                                outputRange: [space.x2 * direction, 0, space.x2 * direction],
                                extrapolate: 'clamp',
                              })
                            : 0,
                        },
                      ],
                    }}
                  >
                    <Icon color={theme.color.fg} size={iconSize} />
                  </Animated.View>
                  <Text
                    tone={selected === key ? 'fg' : 'muted'}
                    strong={selected === key}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={tabLabel.minimumFontScale}
                    style={{ flexShrink: 1, textAlign: 'center' }}
                  >
                    {t.inboxSections[key]}
                  </Text>
                  {marks[key] ? (
                    <View
                      style={{
                        width: space.x3,
                        height: space.x3,
                        borderRadius: radius.round,
                        backgroundColor: activityDotColor(theme, key),
                      }}
                    />
                  ) : null}
                </Animated.View>
              </Pressable>
            );
          })}
        </View>
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 0,
            start: 0,
            height: edge.focus,
            width: tabWidth,
            backgroundColor: theme.color.accent,
            opacity: showIcons ? 1 : 0,
            transform: [
              {
                translateX: position.interpolate({
                  inputRange: ACTIVITY_TABS.map((_, index) => index),
                  outputRange: ACTIVITY_TABS.map((_, index) =>
                    I18nManager.isRTL ? -index * tabWidth : index * tabWidth,
                  ),
                }),
              },
            ],
          }}
        />
      </View>
    </GestureDetector>
  );
}
