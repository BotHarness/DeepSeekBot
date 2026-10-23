import { Button, Host, Image, Menu } from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  disabled,
  font,
  foregroundStyle,
  frame,
  menuOrder,
} from '@expo/ui/swift-ui/modifiers';
import { Keyboard, Platform, View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { t } from '../strings';
import { creationMenuItems, type CreationMenuItem } from './creation-menu-items';
import type { CreationMenuButtonProps } from './creation-menu-button';

const symbols = {
  bot: 'person',
  zip: 'doc.zipper',
  marketplace: 'globe',
  git: 'point.3.connected.trianglepath.dotted',
  channel: 'bubble.left.and.bubble.right',
  invite: 'person.badge.plus',
  join: 'person.2',
} as const;

export function CreationMenuButton(props: CreationMenuButtonProps) {
  const theme = useDesignTheme();
  const glass = Number.parseInt(String(Platform.Version), 10) >= 26;
  const renderItem = (item: CreationMenuItem) =>
    item.children ? (
      <Menu
        key={item.key}
        label={item.label}
        systemImage={symbols[item.action]}
        modifiers={[menuOrder('fixed')]}
      >
        {item.children.map(renderItem)}
      </Menu>
    ) : (
      <Button
        key={item.key}
        label={item.label}
        systemImage={symbols[item.action]}
        modifiers={[
          accessibilityIdentifier(`creation-${item.key}`),
          accessibilityLabel(item.label),
        ]}
        onPress={() => props.onPick(item.action, item.target)}
      />
    );
  return (
    <View onTouchStart={Keyboard.dismiss}>
      <Host
        key={theme.scheme}
        colorScheme={theme.scheme}
        style={{ width: props.size, height: props.size }}
      >
        <Menu
          label={
            <Image
              systemName="plus"
              modifiers={[
                font({ textStyle: 'title2' }),
                frame({ width: props.size - space.x5, height: props.size - space.x5 }),
              ]}
            />
          }
          modifiers={[
            buttonStyle(glass ? 'glass' : 'bordered'),
            buttonBorderShape('circle'),
            foregroundStyle(theme.color.fg),
            accessibilityLabel(t.createHere),
            accessibilityIdentifier('creation-menu-trigger'),
            menuOrder('fixed'),
            disabled(props.busy),
          ]}
        >
          {creationMenuItems(props).map(renderItem)}
        </Menu>
      </Host>
    </View>
  );
}
