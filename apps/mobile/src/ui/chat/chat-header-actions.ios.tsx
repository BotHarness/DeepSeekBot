import { Host } from '@expo/ui';
import { Button, HStack, Image, Menu } from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  accessibilityLabel,
  buttonStyle,
  contentShape,
  disabled,
  foregroundStyle,
  frame,
  glassEffect,
  shapes,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../design/theme';
import { MENU_SYMBOL } from '../primitives/menu-symbols';
import { controlCase } from '../platform-copy';
import { headerContentScale, headerControlHeight } from './native-header';
import type { ChatHeaderActionsProps } from './chat-header-actions';

const symbols = { back: 'chevron.left', call: 'phone', more: 'ellipsis' } as const;

export function ChatHeaderActions(props: ChatHeaderActionsProps) {
  const actions =
    props.kind === 'back'
      ? [{ ...props.back, icon: 'back' as const }]
      : props.kind === 'actions'
        ? props.actions
        : [];
  const theme = useDesignTheme();
  const height = headerControlHeight(theme);
  const symbolSize = theme.type.body.line * headerContentScale(theme);
  const count = props.kind === 'menu' ? 1 : actions.length;
  const glyph = (icon: keyof typeof symbols) => (
    <Image
      systemName={symbols[icon]}
      size={symbolSize}
      modifiers={[
        frame({ width: height, height, alignment: 'center' }),
        contentShape(shapes.rectangle()),
      ]}
    />
  );
  return (
    <Host colorScheme={theme.scheme} style={{ width: height * count, height }}>
      <HStack
        spacing={0}
        modifiers={[
          glassEffect({
            glass: { variant: 'regular', interactive: true },
            shape: count === 1 ? 'circle' : 'capsule',
          }),
        ]}
      >
        {props.kind === 'menu' ? (
          <Menu
            label={glyph('more')}
            modifiers={[
              buttonStyle('plain'),
              accessibilityLabel(props.menu.label),
              accessibilityIdentifier(props.menu.testID),
              tint(theme.color.fg),
            ]}
          >
            {props.menu.items.map((item) => (
              <Button
                key={item.testID}
                testID={item.testID}
                label={controlCase(item.label)}
                systemImage={MENU_SYMBOL[item.icon]}
                {...(item.destructive ? { role: 'destructive' as const } : {})}
                modifiers={[disabled(item.disabled === true)]}
                onPress={item.run}
              />
            ))}
          </Menu>
        ) : (
          actions.map((action) => (
            <Button
              key={action.testID}
              testID={action.testID}
              onPress={action.onPress}
              modifiers={[
                buttonStyle('plain'),
                accessibilityLabel(action.label),
                foregroundStyle(theme.color.fg),
              ]}
            >
              {glyph(action.icon)}
            </Button>
          ))
        )}
      </HStack>
    </Host>
  );
}
