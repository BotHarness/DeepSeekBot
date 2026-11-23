export const native = {
  os: 'ios',
  appState: 'active',
  appStateListeners: new Set<(state: string) => void>(),
  copied: [] as string[],
  sheets: [] as Array<{ options: string[]; cancelButtonIndex?: number }>,
  toasts: [] as string[],
  shared: [] as string[],
  pick: 0,
  presses: new Map<string, () => void>(),
  holds: new Map<string, () => void>(),
  actions: new Map<string, (event: { nativeEvent: { actionName: string } }) => void>(),
  layouts: new Map<string, (event: { nativeEvent: { layout: { height: number } } }) => void>(),
  dismiss: () => {},
  longPresses: Array<{ enabled: boolean; duration: number; start: () => void }>(),
};

export async function mockGestureHandler() {
  const shim = await import('./gesture-handler-shim');
  return {
    ...shim,
    Gesture: new Proxy(shim.Gesture, {
      get: (target, key) => {
        if (key !== 'LongPress') return Reflect.get(target, key);
        return () => {
          const gesture = { enabled: true, duration: 500, start: () => {} };
          native.longPresses.push(gesture);
          const builder = {
            enabled: (value: boolean) => ((gesture.enabled = value), builder),
            minDuration: (value: number) => ((gesture.duration = value), builder),
            runOnJS: () => builder,
            onStart: (callback: () => void) => ((gesture.start = callback), builder),
          };
          return builder;
        };
      },
    }),
  };
}

export async function mockReactNative() {
  const { useWindowDimensions, StyleSheet } = await import('./react-native-shim');
  const host = (name: string) => {
    const Component = ({ children, ...props }: Record<string, unknown>) => {
      const pressKey = props['accessibilityLabel'] ?? props['accessibilityHint'];
      if (typeof props['onPress'] === 'function' && typeof pressKey === 'string')
        native.presses.set(pressKey, props['onPress'] as () => void);
      if (typeof props['onLongPress'] === 'function' && typeof pressKey === 'string')
        native.holds.set(pressKey, props['onLongPress'] as () => void);
      if (typeof props['onAccessibilityAction'] === 'function' && typeof pressKey === 'string')
        native.actions.set(pressKey, props['onAccessibilityAction'] as never);
      if (typeof props['onLayout'] === 'function' && typeof props['testID'] === 'string')
        native.layouts.set(props['testID'], props['onLayout'] as never);
      const attributes: Record<string, string> = {};
      for (const key of [
        'accessible',
        'accessibilityLabel',
        'accessibilityRole',
        'accessibilityHint',
        'accessibilityState',
        'accessibilityValue',
        'selectable',
        'source',
        'recyclingKey',
        'cachePolicy',
        'nativeID',
        'testID',
        'accessibilityElementsHidden',
        'accessibilityActions',
        'importantForAccessibility',
      ])
        if (props[key] !== undefined)
          attributes[`data-${key.toLowerCase()}`] =
            typeof props[key] === 'object' ? JSON.stringify(props[key]) : String(props[key]);
      const style = props['style'] as { opacity?: number } | undefined;
      const touch = props['onTouchStart'];
      return (
        <div
          ref={props['ref'] as never}
          data-native={name}
          {...attributes}
          style={{ opacity: style?.opacity }}
          onClick={props['onPress'] as (() => void) | undefined}
          onTouchStart={typeof touch === 'function' ? () => touch() : undefined}
        >
          {(typeof children === 'function' ? children({ pressed: false }) : children) as never}
        </div>
      );
    };
    return Component;
  };
  return {
    I18nManager: { isRTL: false },
    useWindowDimensions,
    Dimensions: {
      get: useWindowDimensions,
      addEventListener: (_event: string, _changed: () => void) => ({ remove() {} }),
    },
    AppState: {
      get currentState() {
        return native.appState;
      },
      addEventListener(_type: string, listener: (state: string) => void) {
        native.appStateListeners.add(listener);
        return { remove: () => native.appStateListeners.delete(listener) };
      },
    },
    StyleSheet,
    View: host('View'),
    Text: host('Text'),
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    Modal: ({
      visible,
      children,
      onDismiss,
    }: {
      visible: boolean;
      children: unknown;
      onDismiss: () => void;
    }) => {
      native.dismiss = onDismiss;
      return visible ? <div data-native="Modal">{children as never}</div> : null;
    },
    Image: host('Image'),
    Share: { share: async ({ message }: { message: string }) => native.shared.push(message) },
    ActivityIndicator: host('ActivityIndicator'),
    Linking: { openURL: async () => undefined },
    Platform: {
      get OS() {
        return native.os;
      },
      select: (options: Record<string, unknown>) => options['ios'],
    },
    ActionSheetIOS: {
      showActionSheetWithOptions(
        options: { options: string[]; cancelButtonIndex?: number },
        callback: (index: number) => void,
      ) {
        native.sheets.push(options);
        callback(native.pick);
      },
    },
    ToastAndroid: { SHORT: 0, show: (text: string) => native.toasts.push(text) },
    useColorScheme: () => 'light',
  };
}

export function mockEnrichedMarkdown() {
  return {
    EnrichedMarkdownText: (props: {
      markdown: string;
      selectable?: boolean;
      enableBlockContextMenu?: boolean;
      flavor?: string;
      md4cFlags?: { latexMath?: boolean };
      onLinkPress?: unknown;
    }) => (
      <div
        data-native="EnrichedMarkdownText"
        data-selectable={String(props.selectable)}
        data-block-context-menu={String(props.enableBlockContextMenu)}
        data-flavor={props.flavor}
        data-latex={String(props.md4cFlags?.latexMath)}
        data-links={String(typeof props.onLinkPress === 'function')}
        data-markdown={props.markdown}
      />
    ),
  };
}

export function resetNative() {
  native.os = 'ios';
  native.copied.length = 0;
  native.sheets.length = 0;
  native.toasts.length = 0;
  native.shared.length = 0;
  native.pick = 0;
  native.presses.clear();
  native.holds.clear();
  native.layouts.clear();
  native.actions.clear();
  native.longPresses.length = 0;
}
