import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { RosterBot } from '../../host/client';
import { buttonColors } from '../design/controls';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { ChevronDownIcon, StopIcon } from '../shell/icons';
import { t } from '../strings';
import { stepLabel, stepRows } from './bot-steps';

export function StatusStrip({
  bot,
  stopping,
  onStop,
}: {
  bot: RosterBot;
  stopping: boolean;
  onStop(): void;
}) {
  const theme = useDesignTheme();
  const stopColors = buttonColors(theme, 'secondary', 'canvas');
  const [open, setOpen] = useState(false);
  const rows = stepRows(bot);
  return (
    <View accessibilityLiveRegion="polite" style={{ paddingVertical: space.x2 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x3,
          paddingLeft: space.x5,
          paddingRight: space.x3,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.showSteps(bot.displayName)}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((current) => !current)}
          style={{
            flex: 1,
            minHeight: theme.touch,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x3,
          }}
        >
          <View
            style={{
              width: space.x3,
              height: space.x3,
              borderRadius: radius.round,
              backgroundColor: theme.color.accent,
            }}
          />
          <Text variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
            {`${bot.displayName} · ${stepLabel(bot.activity, bot.state)}…`}
          </Text>
          {rows.length === 0 ? null : (
            <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
              <ChevronDownIcon color={theme.color.muted} size={theme.type.meta.line} />
            </View>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.stopBot(bot.displayName)}
          accessibilityState={{ disabled: stopping, busy: stopping }}
          disabled={stopping}
          onPress={onStop}
          style={({ pressed }) => ({
            minHeight: theme.touch,
            minWidth: theme.touch,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: space.x2,
            paddingHorizontal: space.x4,
            borderRadius: radius.round,
            backgroundColor: pressed ? stopColors.pressed : stopColors.fill,
            opacity: stopping ? 0.6 : 1,
          })}
        >
          <StopIcon color={theme.color.fg} size={theme.type.meta.line} />
          <Text variant="meta" strong>
            {stopping ? t.stopping : t.stop}
          </Text>
        </Pressable>
      </View>
      {open
        ? rows.map((row) => (
            <View
              key={row.key}
              style={{
                flexDirection: 'row',
                gap: space.x3,
                paddingLeft: space.x5 + space.x3 + space.x3,
                paddingRight: space.x5,
                paddingVertical: space.x1,
              }}
            >
              <Text variant="meta" strong numberOfLines={1} style={{ flexShrink: 1 }}>
                {row.who}
              </Text>
              <Text variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 2 }}>
                {row.what}
              </Text>
            </View>
          ))
        : null}
    </View>
  );
}
