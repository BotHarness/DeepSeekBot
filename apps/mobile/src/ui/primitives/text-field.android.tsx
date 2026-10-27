import {
  Host,
  Text,
  TextField as MaterialTextField,
  useNativeState,
  type TextFieldImeAction,
  type TextFieldKeyboardActions,
  type TextFieldKeyboardType,
  type TextFieldRef,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth, semantics, testID } from '@expo/ui/jetpack-compose/modifiers';
import { useContext, useLayoutEffect, useReducer, useRef } from 'react';
import {
  View,
  type NativeSyntheticEvent,
  type TextInputProps,
  type TextInputSubmitEditingEvent,
  type ViewInstance,
} from 'react-native';
import { useDesignTheme } from '../design/theme';
import { KeyboardFormNativeFocus } from './keyboard-form-context';
import type { TextFieldProps } from './text-field';

const keyboards: Partial<
  Record<NonNullable<TextInputProps['keyboardType']>, TextFieldKeyboardType>
> = {
  'number-pad': 'number',
  numeric: 'number',
  'decimal-pad': 'decimal',
  'email-address': 'email',
  'phone-pad': 'phone',
  url: 'uri',
  'visible-password': 'ascii',
  'ascii-capable': 'ascii',
};

const imeActions: Partial<
  Record<NonNullable<TextInputProps['returnKeyType']>, TextFieldImeAction>
> = {
  done: 'done',
  go: 'go',
  next: 'next',
  previous: 'previous',
  search: 'search',
  send: 'send',
  none: 'none',
};

const submitActions: Partial<Record<TextFieldImeAction, keyof TextFieldKeyboardActions>> = {
  done: 'onDone',
  go: 'onGo',
  next: 'onNext',
  previous: 'onPrevious',
  search: 'onSearch',
  send: 'onSend',
};

function keyboardType({ keyboardType: kind, secureTextEntry }: TextFieldProps) {
  const base = (kind && keyboards[kind]) ?? 'text';
  if (!secureTextEntry) return base;
  return base === 'number' ? 'numberPassword' : 'password';
}

function event<T>(text: string) {
  return { nativeEvent: { text } } as unknown as NativeSyntheticEvent<T>;
}

export function TextField(props: TextFieldProps) {
  const {
    value = '',
    onChangeText,
    accessibilityLabel,
    label = accessibilityLabel,
    placeholder,
    supportingText,
    multiline,
    numberOfLines,
    editable,
    autoCapitalize,
    autoCorrect,
    autoFocus,
    maxLength,
    returnKeyType,
    secureTextEntry,
    onSubmitEditing,
    onFocus,
    onBlur,
    testID: id,
    invalid = false,
    style,
  } = props;
  const theme = useDesignTheme();
  const focus = useContext(KeyboardFormNativeFocus);
  const wrapper = useRef<ViewInstance | null>(null);
  const field = useRef<TextFieldRef | null>(null);
  const focused = useRef(false);
  const text = useNativeState(value);
  const pendingEchoes = useRef<string[]>([]);
  const [, typed] = useReducer((count: number) => count + 1, 0);
  useLayoutEffect(() => {
    const echoed = pendingEchoes.current.indexOf(value);
    if (echoed >= 0) pendingEchoes.current.splice(0, echoed + 1);
    else {
      pendingEchoes.current = [];
      if (text.get() !== value) text.set(value);
    }
  });
  const imeAction =
    (returnKeyType && imeActions[returnKeyType]) ?? (multiline ? 'default' : 'done');
  const submitAction = submitActions[imeAction];
  const submit = (current: string) => {
    onSubmitEditing?.(event<TextInputSubmitEditingEvent['nativeEvent']>(current));
    if (!multiline) void field.current?.blur();
  };
  return (
    <View
      ref={wrapper}
      style={style}
      onLayout={() => {
        if (wrapper.current && focused.current) focus?.(wrapper.current, true);
      }}
    >
      <Host
        matchContents={{ vertical: true }}
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        ignoreSafeAreaKeyboardInsets
      >
        <MaterialTextField
          ref={field}
          value={text}
          onValueChange={(next) => {
            pendingEchoes.current.push(next);
            onChangeText?.(next);
            typed();
          }}
          onFocusChanged={(next) => {
            focused.current = next;
            if (wrapper.current) focus?.(wrapper.current, next);
            if (next) onFocus?.(event(text.get()));
            else onBlur?.(event(text.get()));
          }}
          autoFocus={autoFocus ?? false}
          enabled={editable !== false}
          singleLine={!multiline}
          minLines={multiline ? Math.max(numberOfLines ?? 2, 1) : 1}
          {...(maxLength === undefined ? {} : { maxLength })}
          visualTransformation={secureTextEntry ? 'password' : 'none'}
          isError={invalid}
          keyboardOptions={{
            capitalization: autoCapitalize ?? 'sentences',
            autoCorrectEnabled: secureTextEntry ? false : (autoCorrect ?? true),
            keyboardType: keyboardType(props),
            imeAction,
          }}
          keyboardActions={submitAction ? { [submitAction]: submit } : {}}
          modifiers={[
            fillMaxWidth(),
            ...(id ? [testID(id)] : []),
            ...(accessibilityLabel ? [semantics({ contentDescription: accessibilityLabel })] : []),
          ]}
        >
          {label ? (
            <MaterialTextField.Label>
              <Text>{label}</Text>
            </MaterialTextField.Label>
          ) : null}
          {placeholder && placeholder !== label ? (
            <MaterialTextField.Placeholder>
              <Text>{placeholder}</Text>
            </MaterialTextField.Placeholder>
          ) : null}
          {supportingText ? (
            <MaterialTextField.SupportingText>
              <Text>{supportingText}</Text>
            </MaterialTextField.SupportingText>
          ) : null}
        </MaterialTextField>
      </Host>
    </View>
  );
}
