import {
  Button,
  Divider,
  Host,
  Image,
  Label,
  Menu,
  Popover,
  Section,
  VStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  accessibilityLabel,
  buttonStyle,
  disabled,
  fixedSize,
  foregroundStyle,
  frame,
  glassEffect,
  menuIndicator,
  menuOrder,
  menuStyle,
  padding,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { fab, space } from '../design/tokens';
import { useStrings } from '../strings';
import type { CreationMenuButtonProps } from './creation-menu-button';
import { creationMenuGroups, type CreationMenuItem } from './creation-menu-items';

const symbols = {
  'create-bot': 'person.crop.circle.badge.plus',
  bot: 'person',
  zip: 'doc.zipper',
  marketplace: 'globe',
  git: 'point.3.connected.trianglepath.dotted',
  channel: 'bubble.left.and.bubble.right',
  invite: 'person.badge.plus',
  join: 'person.2',
} as const;

const triggerId = 'creation-menu-trigger';

export function CreationMenuButton(props: CreationMenuButtonProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const iOS = Number.parseInt(String(Platform.Version), 10);
  const groups = creationMenuGroups(props);
  const label = (
    <Image
      systemName="plus"
      size={theme.type.title.size}
      modifiers={[
        foregroundStyle(theme.color.fg),
        frame({ width: props.size, height: props.size }),
      ]}
    />
  );
  const triggerModifiers = [
    accessibilityLabel(t.createHere),
    accessibilityIdentifier(triggerId),
    disabled(props.busy),
  ];
  const pick = (item: CreationMenuItem) => {
    if (item.action === 'create-bot' || props.busy) return;
    setOpen(false);
    props.onPick(item.action, item.target);
  };
  const menuItem = (item: CreationMenuItem) =>
    item.children ? (
      <Menu
        key={item.key}
        label={item.label}
        systemImage={symbols[item.action]}
        modifiers={[menuOrder('fixed')]}
      >
        {item.children.map(menuItem)}
      </Menu>
    ) : (
      <Button
        key={item.key}
        testID={`creation-${item.key}`}
        label={item.label}
        systemImage={symbols[item.action]}
        onPress={() => pick(item)}
      />
    );
  const popoverItem = (item: CreationMenuItem) => {
    const row = (
      <Label
        title={item.label}
        systemImage={symbols[item.action]}
        modifiers={[
          fixedSize({ horizontal: false, vertical: true }),
          frame({ minHeight: theme.touch, maxWidth: Infinity, alignment: 'leading' }),
        ]}
      />
    );
    return item.children ? (
      <Menu key={item.key} label={row} modifiers={[menuStyle('button'), menuOrder('fixed')]}>
        {item.children.map(menuItem)}
      </Menu>
    ) : (
      <Button
        key={item.key}
        testID={`creation-${item.key}`}
        modifiers={[buttonStyle('plain')]}
        onPress={() => pick(item)}
      >
        {row}
      </Button>
    );
  };
  return (
    <Host colorScheme={theme.scheme} style={{ width: props.size, height: props.size }}>
      {iOS >= 27 ? (
        <Popover isPresented={open} onIsPresentedChange={setOpen}>
          <Popover.Trigger>
            <Button
              onPress={() => setOpen(true)}
              modifiers={[
                ...triggerModifiers,
                buttonStyle('plain'),
                glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'circle' }),
              ]}
            >
              {label}
            </Button>
          </Popover.Trigger>
          <Popover.Content>
            <VStack
              alignment="leading"
              modifiers={[
                frame({ width: Math.min(width - space.x5 * 2, fab.menuWidth) }),
                padding({ horizontal: space.x4, vertical: space.x2 }),
                tint(theme.color.fg),
              ]}
            >
              {groups.map((group, index) => (
                <VStack key={group[0]?.key} alignment="leading">
                  {index > 0 ? <Divider /> : null}
                  {group.map(popoverItem)}
                </VStack>
              ))}
            </VStack>
          </Popover.Content>
        </Popover>
      ) : (
        <Menu
          label={label}
          modifiers={[
            ...triggerModifiers,
            menuStyle('button'),
            buttonStyle('plain'),
            menuIndicator('hidden'),
            menuOrder('fixed'),
            ...(iOS >= 26
              ? [glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'circle' })]
              : []),
          ]}
        >
          {groups.map((group) => (
            <Section key={group[0]?.key}>{group.map(menuItem)}</Section>
          ))}
        </Menu>
      )}
    </Host>
  );
}
