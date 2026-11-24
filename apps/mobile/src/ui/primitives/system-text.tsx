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
import { useDesignTheme } from '../design/theme';
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
  const { scheme } = useDesignTheme();
  const { fontScale } = useWindowDimensions();
  if (!ios) return <NativeTextInput keyboardAppearance={scheme} {...props} style={style} />;
  if (props.multiline === true)
    return (
      <NativeTextInput
        keyboardAppearance={scheme}
        {...props}
        {...{ dynamicTypeRamp }}
        style={[{ fontSize: typeScale.ios.body.size }, style]}
      />
    );
  const metrics = StyleSheet.flatten(style);
  const ceiling = props.maxFontSizeMultiplier ?? 0;
  const scale =
    props.allowFontScaling === false ? 1 : ceiling >= 1 ? Math.min(fontScale, ceiling) : fontScale;
  const size = (metrics?.fontSize ?? typeScale.ios.body.size) * scale;
  return (
    <NativeTextInput
      keyboardAppearance={scheme}
      {...props}
      allowFontScaling={false}
      style={[
        style,
        {
          fontSize: size,
          ...(metrics?.lineHeight === undefined ? {} : { lineHeight: metrics.lineHeight * scale }),
        },
      ]}
    />
  );
}
