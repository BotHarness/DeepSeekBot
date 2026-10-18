import { createContext, useContext, type ComponentPropsWithRef } from 'react';
import {
  Platform,
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  useWindowDimensions,
  type TextProps,
} from 'react-native';

import { textRamp } from '../design/system-type';
import { typeScale } from '../design/tokens';

const TextAncestor = createContext(false);

export function Text({
  style,
  dynamicTypeRamp,
  ...props
}: ComponentPropsWithRef<typeof NativeText>) {
  const nested = useContext(TextAncestor);
  const { fontScale } = useWindowDimensions();
  const ios = Platform.OS === 'ios';
  const metrics = StyleSheet.flatten(style);
  const ramp =
    dynamicTypeRamp ??
    (nested && metrics?.fontSize === undefined ? undefined : textRamp(metrics?.fontSize));
  return (
    <NativeText
      {...props}
      key={ios && !nested && props.allowFontScaling !== false ? fontScale : undefined}
      dynamicTypeRamp={ios ? ramp : undefined}
      style={ios && !nested ? [{ fontSize: typeScale.ios.body.size }, style] : style}
    >
      <TextAncestor.Provider value>{props.children}</TextAncestor.Provider>
    </NativeText>
  );
}

export type TextInput = NativeTextInput;
type InputProps = ComponentPropsWithRef<typeof NativeTextInput> &
  Pick<TextProps, 'dynamicTypeRamp'>;

export function TextInput({ style, dynamicTypeRamp = 'body', ...props }: InputProps) {
  const ios = Platform.OS === 'ios';
  return (
    <NativeTextInput
      {...props}
      {...(ios ? { dynamicTypeRamp } : {})}
      style={ios ? [{ fontSize: typeScale.ios.body.size }, style] : style}
    />
  );
}
