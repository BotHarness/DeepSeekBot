import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { ChevronDownIcon } from './icons';

export function PairingGuide({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const theme = useDesignTheme();
  const [open, setOpen] = useState(initiallyOpen);
  const [linkError, setLinkError] = useState(false);
  const openGuide = () => {
    setLinkError(false);
    void Linking.openURL(t.pairGuide.url).catch(() => setLinkError(true));
  };
  return (
    <View
      style={{
        gap: space.x3,
        padding: space.x5,
        paddingVertical: space.x2,
        borderRadius: radius.lg,
        backgroundColor: theme.layer.raised.fill,
      }}
    >
      <Pressable
        testID="pair-guide-toggle"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x2,
          minHeight: theme.touch,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text strong style={{ flex: 1 }}>
          {t.pairGuide.title}
        </Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <ChevronDownIcon color={theme.color.muted} size={theme.type.body.line} />
        </View>
      </Pressable>
      {open ? (
        <View style={{ gap: space.x3, paddingBottom: space.x3 }}>
          {t.pairGuide.steps.map((step, index) => (
            <View key={step} style={{ flexDirection: 'row', gap: space.x2 }}>
              <Text tone="muted" strong>
                {`${index + 1}.`}
              </Text>
              <Text tone="muted" style={{ flex: 1 }}>
                {step}
              </Text>
            </View>
          ))}
          <Button
            testID="pair-guide-open"
            label={t.pairGuide.open}
            variant="text"
            onPress={openGuide}
          />
          {linkError ? (
            <Text accessibilityRole="alert" tone="danger">
              {t.pairGuide.linkError}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
