import { Column, RNHostView, Row, Text, useMaterialColors } from '@expo/ui/jetpack-compose';
import {
  Shapes,
  background,
  clickable,
  clip,
  defaultMinSize,
  fillMaxWidth,
  graphicsLayer,
  padding,
  paddingAll,
  semantics,
  selectable,
  testID,
  weight,
} from '@expo/ui/jetpack-compose/modifiers';
import type { ReactElement } from 'react';

import { useDesignTheme } from '../design/theme';
import { materialMenu } from '../design/tokens';
import { SystemSymbol } from './system-symbol';

export type MaterialMenuItem = {
  key: string;
  label: string;
  icon: ReactElement;
  onPress(): void;
  disabled?: boolean;
  destructive?: boolean;
  selected?: boolean;
  testID?: string;
};

export function MaterialMenuGroup({ items }: { items: readonly MaterialMenuItem[] }) {
  const theme = useDesignTheme();
  const colors = useMaterialColors();
  return (
    <Column
      modifiers={[
        fillMaxWidth(),
        graphicsLayer({
          shadowElevation: materialMenu.elevation,
          shape: Shapes.RoundedCorner(materialMenu.containerRadius),
        }),
        clip(Shapes.RoundedCorner(materialMenu.containerRadius)),
        background(colors.surfaceContainerLow),
        paddingAll(materialMenu.groupPadding),
      ]}
    >
      {items.map((item, index) => {
        const shape = item.selected
          ? Shapes.RoundedCorner(materialMenu.outerItemRadius)
          : Shapes.RoundedCorner({
              topStart: index === 0 ? materialMenu.outerItemRadius : materialMenu.innerItemRadius,
              topEnd: index === 0 ? materialMenu.outerItemRadius : materialMenu.innerItemRadius,
              bottomStart:
                index === items.length - 1
                  ? materialMenu.outerItemRadius
                  : materialMenu.innerItemRadius,
              bottomEnd:
                index === items.length - 1
                  ? materialMenu.outerItemRadius
                  : materialMenu.innerItemRadius,
            });
        return (
          <Row
            key={item.key}
            verticalAlignment="center"
            horizontalArrangement={{ spacedBy: materialMenu.iconLabelGap }}
            modifiers={[
              fillMaxWidth(),
              clip(shape),
              ...(item.selected ? [background(theme.layer.sheet.chosen)] : []),
              ...(item.testID ? [testID(item.testID)] : []),
              ...(item.disabled
                ? []
                : [
                    item.selected === undefined
                      ? clickable(item.onPress)
                      : selectable(item.selected, item.onPress, 'radioButton'),
                  ]),
              semantics({ contentDescription: item.label }),
              defaultMinSize({ minHeight: Math.max(theme.touch, materialMenu.itemHeight) }),
              padding(
                materialMenu.horizontalPadding,
                materialMenu.verticalPadding,
                materialMenu.horizontalPadding,
                materialMenu.verticalPadding,
              ),
            ]}
          >
            <RNHostView matchContents>{item.icon}</RNHostView>
            <Text
              color={
                item.disabled
                  ? theme.color.subtle
                  : item.selected
                    ? theme.color.fg
                    : item.destructive
                      ? theme.color.danger
                      : colors.onSurface
              }
              style={{ typography: 'labelLarge' }}
              modifiers={[weight(1)]}
            >
              {item.label}
            </Text>
            {item.selected ? (
              <RNHostView matchContents>
                <SystemSymbol
                  name={{ ios: 'checkmark', android: 'check' }}
                  color={theme.color.accent}
                  size={materialMenu.iconSize}
                />
              </RNHostView>
            ) : null}
          </Row>
        );
      })}
    </Column>
  );
}
