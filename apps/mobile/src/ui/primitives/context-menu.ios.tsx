import { Button, ContextMenu, Host, RNHostView } from '@expo/ui/swift-ui';
import { foregroundStyle, tint } from '@expo/ui/swift-ui/modifiers';
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
      style={fill ? { flex: 1 } : { alignSelf: 'stretch' }}
    >
      <ContextMenu modifiers={[tint(theme.color.fg)]}>
        <ContextMenu.Trigger>
          <RNHostView matchContents={{ vertical: true }} boundedByHost>
            <>{children}</>
          </RNHostView>
        </ContextMenu.Trigger>
        <ContextMenu.Items>
          {actions.map((action) => {
            const props: ComponentProps<typeof Button> = {
              label: controlCase(action.label),
              onPress: action.run,
              modifiers: [
                foregroundStyle(action.destructive === true ? theme.color.danger : theme.color.fg),
              ],
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
