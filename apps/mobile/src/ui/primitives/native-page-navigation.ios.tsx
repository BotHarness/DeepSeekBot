import {
  Button,
  Host,
  NavigationStack,
  RNHostView,
  Toolbar,
  ToolbarItem,
  VStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  frame,
  ignoreSafeArea,
  labelStyle,
  navigationBarTitleDisplayMode,
  navigationTitle,
} from '@expo/ui/swift-ui/modifiers';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useDesignTheme } from '../design/theme';
import { useStrings } from '../strings';

export function NativePageNavigation({
  children,
  title,
  onBack,
  backID,
  enabled = true,
}: {
  children: ReactNode;
  title?: ReactNode;
  onBack(): void;
  backID: string;
  enabled?: boolean;
}) {
  const theme = useDesignTheme();
  const t = useStrings();
  if (!enabled) return children;
  return (
    <Host style={{ flex: 1 }} colorScheme={theme.scheme} ignoreSafeArea="keyboard">
      <NavigationStack modifiers={[navigationBarTitleDisplayMode('inline'), navigationTitle('')]}>
        <Toolbar>
          <VStack
            modifiers={[
              frame({ maxWidth: Infinity, maxHeight: Infinity }),
              ignoreSafeArea({ regions: 'container', edges: 'bottom' }),
            ]}
          >
            <RNHostView>
              <HeaderHeightContext value={0}>
                <View style={{ flex: 1 }}>{children}</View>
              </HeaderHeightContext>
            </RNHostView>
          </VStack>
          <Toolbar.Content>
            <ToolbarItem placement="topBarLeading">
              <Button
                label={t.back}
                systemImage="chevron.left"
                onPress={onBack}
                modifiers={[labelStyle('iconOnly'), accessibilityIdentifier(backID)]}
              />
            </ToolbarItem>
            {title === undefined ? null : (
              <ToolbarItem placement="topBarLeading">
                <RNHostView matchContents>
                  <View>{title}</View>
                </RNHostView>
              </ToolbarItem>
            )}
          </Toolbar.Content>
        </Toolbar>
      </NavigationStack>
    </Host>
  );
}
