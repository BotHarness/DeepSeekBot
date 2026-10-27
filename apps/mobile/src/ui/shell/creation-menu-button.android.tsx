import { requireNativeView } from 'expo';
import { useState } from 'react';
import {
  Keyboard,
  View,
  useWindowDimensions,
  type ViewInstance,
  type ViewProps,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useDesignTheme } from '../design/theme';
import { fab } from '../design/tokens';
import { haptic } from '../haptics';
import { useMounted } from '../mounted';
import { useStrings } from '../strings';
import { holdBack } from './back-owner';
import { creationMenuItems, type CreationMenuItem } from './creation-menu-items';
import type { CreationMenuButtonProps } from './creation-menu-button';
import { fabMenuPath, type FabMenuIcon } from './fab-menu-paths';

type NativeFabMenuProps = ViewProps & {
  items: { key: string; label: string; path: string }[];
  expanded: boolean;
  available: boolean;
  label: string;
  closeLabel: string;
  dark: boolean;
  buttonContainer: string;
  buttonContent: string;
  itemContainer: string;
  itemContent: string;
  reduceMotion: boolean;
  onToggle(event: { nativeEvent: { expanded: boolean } }): void;
  onPick(event: { nativeEvent: { key: string } }): void;
};

const NativeFabMenu = requireNativeView<NativeFabMenuProps>('MaterialFabMenu');

export function fabMenuHeight(count: number, size: number): number {
  return (
    count * fab.menuItemHeight +
    Math.max(0, count - 1) * fab.menuItemGap +
    fab.menuCloseGap +
    size +
    fab.margin
  );
}

function BackWhileOpen({ onBack }: { onBack(): void }) {
  const mount = useMounted<ViewInstance>(() => {
    const back = holdBack(() => {
      onBack();
      return true;
    });
    return () => back.remove();
  }, []);
  return <View ref={mount} />;
}

export function CreationMenuButton(props: CreationMenuButtonProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [sized, setSized] = useState(false);
  const [parent, setParent] = useState<CreationMenuItem>();
  const close = () => {
    setOpen(false);
    setParent(undefined);
    if (reduced) setSized(false);
    else setTimeout(() => setSized(false), fab.menuSettle);
  };
  const entries: {
    key: string;
    label: string;
    icon: FabMenuIcon;
    item?: CreationMenuItem | undefined;
  }[] = [
    ...(parent ? [{ key: 'back', label: t.back, icon: 'back' as const }] : []),
    ...(parent?.children ?? creationMenuItems({ ...props, nativeChannelForm: true })).map(
      (item): { key: string; label: string; icon: FabMenuIcon; item: CreationMenuItem } => ({
        key: item.key,
        label: item.label,
        icon: parent ? (item.target?.kind === 'cloud' ? 'cloud' : 'computer') : item.action,
        item,
      }),
    ),
  ];
  const pick = (key: string) => {
    if (props.busy) return;
    if (key === 'back') {
      setParent(undefined);
      return;
    }
    const item = entries.find((entry) => entry.key === key)?.item;
    if (item === undefined) return;
    if (item.children) {
      setParent(item);
      return;
    }
    close();
    props.onPick(item.action, item.target);
  };
  return (
    <View
      style={
        open || sized
          ? {
              width: Math.min(width - fab.margin * 2, fab.menuWidth),
              height: fabMenuHeight(entries.length, props.size),
            }
          : { width: props.size, height: props.size }
      }
    >
      {open ? <BackWhileOpen onBack={close} /> : null}
      <NativeFabMenu
        testID="creation-fab-menu"
        style={{ flex: 1 }}
        items={entries.map((entry) => ({
          key: entry.key,
          label: entry.label,
          path: fabMenuPath[entry.icon],
        }))}
        expanded={open}
        available={!props.busy}
        label={t.createHere}
        closeLabel={t.close}
        dark={theme.scheme === 'dark'}
        buttonContainer={theme.layer.canvas.chosen}
        buttonContent={theme.color.fg}
        itemContainer={theme.color.accent}
        itemContent={theme.color.onAccent}
        reduceMotion={reduced}
        onToggle={(event) => {
          if (event.nativeEvent.expanded) {
            if (props.busy) return;
            Keyboard.dismiss();
            haptic('menu');
            setSized(true);
            setOpen(true);
          } else close();
        }}
        onPick={(event) => pick(event.nativeEvent.key)}
      />
    </View>
  );
}
