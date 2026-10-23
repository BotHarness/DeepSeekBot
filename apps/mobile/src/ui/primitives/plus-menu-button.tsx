import { useRef, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Text } from './text';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { PlusIcon } from '../shell/icons';
import { haptic } from '../haptics';
import { t } from '../strings';

import type { PlusMenuButtonProps } from './plus-menu';
export type { PlusMenuButtonProps, PlusMenuItem } from './plus-menu';

export function PlusMenuButton({
  label,
  testID,
  size,
  disabled = false,
  items,
}: PlusMenuButtonProps) {
  const theme = useDesignTheme();
  const [open, setOpen] = useState(false);
  const opened = useRef(false);
  const close = () => {
    opened.current = false;
    setOpen(false);
  };
  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
        onPress={() => {
          if (opened.current) return;
          opened.current = true;
          haptic('menu');
          setOpen(true);
        }}
      >
        <PlusIcon color={theme.color.fg} size={theme.type.title.line} />
      </Pressable>
      {open && (
        <Modal visible transparent onRequestClose={close}>
          <View style={{ padding: space.x5, backgroundColor: theme.overlay.fill }}>
            {items.map((item) => (
              <Pressable
                key={item.id}
                testID={item.id}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                onPress={() => {
                  close();
                  item.run();
                }}
              >
                <Text>{item.label}</Text>
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" accessibilityLabel={t.close} onPress={close}>
              <Text>{t.close}</Text>
            </Pressable>
          </View>
        </Modal>
      )}
    </>
  );
}
