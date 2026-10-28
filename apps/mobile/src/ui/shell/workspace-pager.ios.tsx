import { useSegments } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useDesignTheme } from '../design/theme';
import { useMounted } from '../mounted';
import { useSystemReducedMotion } from '../primitives/use-system-reduced-motion';
import { WorkspacePanel } from './host-drawer';
import { bindWorkspacePaging, closeWorkspacePage, openWorkspacePage } from './workspace-paging';

export function WorkspacePager({ children }: { children: ReactNode }) {
  const theme = useDesignTheme();
  const segments = useSegments();
  const reduced = useSystemReducedMotion();
  const [visible, setVisible] = useState(false);
  const home = segments.some((segment) => segment === '(home)');
  const mount = useMounted<PagerView>(
    (pager) => {
      const show = (page: number) => {
        if (reduced) pager.setPageWithoutAnimation(page);
        else pager.setPage(page);
      };
      return bindWorkspacePaging({ open: () => show(0), close: () => show(1) });
    },
    [reduced],
  );
  return (
    <PagerView
      ref={mount}
      testID="workspace-pager"
      style={{ flex: 1, backgroundColor: theme.color.base }}
      initialPage={1}
      scrollEnabled={home}
      keyboardDismissMode="on-drag"
      overdrag={false}
      layoutDirection="ltr"
      onPageSelected={(event) => setVisible(event.nativeEvent.position === 0)}
    >
      <View
        key="workspaces"
        testID="workspace-page"
        collapsable={false}
        accessibilityElementsHidden={!visible}
        onAccessibilityEscape={() => closeWorkspacePage()}
        style={{ width: '100%', height: '100%' }}
      >
        <WorkspacePanel page active={visible} />
      </View>
      <View
        key="chats"
        testID="workspace-chats-page"
        collapsable={false}
        accessibilityElementsHidden={visible}
        onAccessibilityEscape={
          home
            ? () => {
                openWorkspacePage();
              }
            : undefined
        }
        style={{ width: '100%', height: '100%' }}
      >
        {children}
      </View>
    </PagerView>
  );
}
