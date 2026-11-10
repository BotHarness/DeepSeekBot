import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { useCallback, useState, type ReactElement } from 'react';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';

type WindowState = { hidden: boolean; width: number; height: number };
type NativeProps = ViewProps & {
  eligible: boolean;
  placeholder: boolean;
  onWindowChange: (event: NativeSyntheticEvent<WindowState>) => void;
};

const NativeBlock =
  process.env.EXPO_PUBLIC_MARKDOWN_WINDOW === 'native' &&
  requireOptionalNativeModule('MarkdownBlockWindow') !== null
    ? requireNativeView<NativeProps>('MarkdownBlockWindow')
    : undefined;

export const nativeMarkdownWindow = NativeBlock !== undefined;

export function MarkdownBlockWindow({
  children,
  eligible,
}: {
  children: ReactElement;
  eligible: boolean;
}) {
  const [window, setWindow] = useState<WindowState>({ hidden: false, width: 0, height: 0 });
  const changed = useCallback(({ nativeEvent }: NativeSyntheticEvent<WindowState>) => {
    if (
      Number.isFinite(nativeEvent.width) &&
      Number.isFinite(nativeEvent.height) &&
      nativeEvent.width > 0 &&
      nativeEvent.height > 0
    )
      setWindow(nativeEvent);
  }, []);
  if (NativeBlock === undefined) return children;
  const hidden = eligible && window.hidden;
  return (
    <NativeBlock
      eligible={eligible}
      placeholder={hidden}
      onWindowChange={changed}
      style={hidden ? { height: window.height, width: window.width, maxWidth: '100%' } : undefined}
    >
      {hidden ? null : children}
    </NativeBlock>
  );
}
