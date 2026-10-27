import { Button, ContextMenu, Host, RNHostView } from '@expo/ui/swift-ui';
import type { ComponentProps, ReactNode } from 'react';

import { useDesignTheme } from '../design/theme';
import { controlCase } from '../platform-copy';
import type { ContextAction } from './context-menu';

export type { ContextAction } from './context-menu';

export function ContextMenuArea({
  actions,
  children,
  fill = false,
}: {
  actions: readonly ContextAction[];
  children: ReactNode;
  fill?: boolean;
}) {
  const theme = useDesignTheme();
  if (actions.length === 0) return children;
  const icons = actions.every((action) => action.systemImage !== undefined);
  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.scheme}
      {...(fill ? { style: { flex: 1 } } : {})}
    >
      <ContextMenu>
        <ContextMenu.Trigger>
          <RNHostView matchContents>
            <>{children}</>
          </RNHostView>
        </ContextMenu.Trigger>
        <ContextMenu.Items>
          {actions.map((action) => {
            const props: ComponentProps<typeof Button> = {
              label: controlCase(action.label),
              onPress: action.run,
            };
            if (icons && action.systemImage !== undefined)
              props.systemImage = action.systemImage as NonNullable<typeof props.systemImage>;
            if (action.destructive === true) props.role = 'destructive';
            return <Button key={action.key} {...props} />;
          })}
        </ContextMenu.Items>
      </ContextMenu>
    </Host>
  );
}

export const nativeContextMenu = true;
