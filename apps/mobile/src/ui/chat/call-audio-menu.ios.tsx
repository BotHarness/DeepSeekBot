import { Host, Image, Label, Menu, Picker, Section } from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  accessibilityLabel,
  accessibilityValue,
  background,
  buttonStyle,
  contentShape,
  disabled as disabledModifier,
  font,
  foregroundStyle,
  frame,
  opacity,
  pickerStyle,
  shapes,
  tag,
} from '@expo/ui/swift-ui/modifiers';

import { CALL_AUDIO_ROUTES, type CallAudioRoute } from '../../host/call-audio-route';
import { useDesignTheme } from '../design/theme';
import { useStrings } from '../strings';
import type { CallAudioMenuProps } from './call-audio-menu';
import { CALL_AUDIO_SYMBOL } from './call-audio-symbol';

export function CallAudioMenu({ route, size, fill, ink, disabled, onChange }: CallAudioMenuProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <Host key={theme.scheme} colorScheme={theme.scheme} style={{ width: size, height: size }}>
      <Menu
        modifiers={[
          buttonStyle('plain'),
          accessibilityLabel(t.call.audio),
          accessibilityValue(t.call.audioRoute[route]),
          accessibilityIdentifier('call-audio'),
          disabledModifier(disabled),
          opacity(disabled ? 0.4 : 1),
        ]}
        label={
          <Image
            systemName={CALL_AUDIO_SYMBOL[route]}
            modifiers={[
              font({ textStyle: 'title2' }),
              foregroundStyle(ink),
              frame({ width: size, height: size }),
              background(fill, shapes.circle()),
              contentShape(shapes.circle()),
            ]}
          />
        }
      >
        <Section title={t.call.audioRouteHint[route]}>
          <Picker
            selection={route}
            onSelectionChange={(next: string) => {
              const picked = CALL_AUDIO_ROUTES.find((value) => value === next);
              if (picked !== undefined && picked !== route) onChange(picked);
            }}
            modifiers={[pickerStyle('inline')]}
          >
            {CALL_AUDIO_ROUTES.map((value: CallAudioRoute) => (
              <Label
                key={value}
                title={t.call.audioRoute[value]}
                systemImage={CALL_AUDIO_SYMBOL[value]}
                modifiers={[tag(value)]}
              />
            ))}
          </Picker>
        </Section>
      </Menu>
    </Host>
  );
}
