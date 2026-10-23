import { Button, Host, Text as ComposeText, TextButton } from '@expo/ui/jetpack-compose';
import { testID as nativeTestID } from '@expo/ui/jetpack-compose/modifiers';
import { useRef, useState } from 'react';
import { Keyboard, ScrollView, View, type TextInputInstance } from 'react-native';
import type { DesktopInput } from '../../../../../packages/computer/src/desktop-view';
import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { TextField } from '../primitives/text-field';
import { t } from '../strings';
import { useMounted } from '../mounted';

export function ComputerVideoKeyboard({
  open,
  enabled,
  onInput,
}: {
  open: boolean;
  enabled: boolean;
  onInput(input: DesktopInput): Promise<boolean>;
}) {
  const submitting = useRef(false);
  const [draft, setDraft] = useState('');
  const [secret, setSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const field = useMounted<TextInputInstance>(
    (input) => {
      if (open) input.focus();
      else {
        input.blur();
        Keyboard.dismiss();
      }
      return () => input.blur();
    },
    [open],
  );
  const submit = async (text: string) => {
    if (!enabled || submitting.current || text.length === 0) return;
    submitting.current = true;
    setBusy(true);
    try {
      if (await onInput({ kind: 'type', text })) setDraft('');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <View style={{ display: open ? 'flex' : 'none', gap: space.x2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
        <TextField
          ref={field}
          testID="computer-video-text"
          accessibilityLabel={t.computerVideoText}
          placeholder={t.computerVideoText}
          value={draft}
          onChangeText={setDraft}
          editable={enabled && !busy}
          maxLength={2000}
          autoCapitalize="none"
          autoCorrect={!secret}
          secureTextEntry={secret}
          autoComplete="off"
          importantForAutofill="no"
          disableFullscreenUI
          submitBehavior="submit"
          returnKeyType="send"
          style={{ flex: 1 }}
          onSubmitEditing={({ nativeEvent }) => void submit(nativeEvent.text)}
        />
        <KeyboardButton
          primary
          label={t.computerVideoSendText}
          testID="computer-video-send-text"
          disabled={!enabled || busy || draft.length === 0}
          onPress={() => void submit(draft)}
        />
      </View>
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        contentContainerStyle={{ gap: space.x2 }}
      >
        <KeyboardButton
          label={t.computerVideoBackspace}
          testID="computer-video-backspace"
          disabled={!enabled || busy}
          onPress={() => void onInput({ kind: 'key', key: 'backspace', modifiers: [] })}
        />
        <KeyboardButton
          label={t.computerKeyTab}
          testID="computer-video-tab"
          disabled={!enabled || busy}
          onPress={() => void onInput({ kind: 'key', key: 'tab', modifiers: [] })}
        />
        <KeyboardButton
          label={t.computerKeyReturn}
          testID="computer-video-enter"
          disabled={!enabled || busy}
          onPress={() => void onInput({ kind: 'key', key: 'return', modifiers: [] })}
        />
        <KeyboardButton
          label={t.computerKeyEscape}
          testID="computer-video-escape"
          disabled={!enabled || busy}
          onPress={() => void onInput({ kind: 'key', key: 'escape', modifiers: [] })}
        />
        <KeyboardButton
          label={secret ? t.computerVideoPlainText : t.computerPasswordKeyboard}
          testID="computer-video-secret"
          disabled={busy}
          onPress={() => setSecret(!secret)}
        />
      </ScrollView>
    </View>
  );
}

function KeyboardButton({
  label,
  testID,
  disabled,
  onPress,
  primary = false,
}: {
  label: string;
  primary?: boolean;
  testID: string;
  disabled?: boolean;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  const Control = primary ? Button : TextButton;
  return (
    <Host matchContents colorScheme={theme.scheme} seedColor={theme.color.accent}>
      <Control enabled={!disabled} onClick={onPress} modifiers={[nativeTestID(testID)]}>
        <ComposeText>{label}</ComposeText>
      </Control>
    </Host>
  );
}
