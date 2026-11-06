import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import type {
  EmailCodeFlow,
  EmailCodeOutcome,
  EmailCodeRefusal,
  SocialProvider,
} from '../../host/connect-account';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { Text } from '../primitives/text';
import { TextField } from '../primitives/text-field';
import { useStrings } from '../strings';

const CODE_LENGTH = 6;
const digits = (value: string) => value.replace(/\D/gu, '').slice(0, CODE_LENGTH);

export function EmailCodeSignIn({
  flow,
  finish,
}: {
  flow: EmailCodeFlow;
  finish(outcome: EmailCodeOutcome): void;
}) {
  const t = useStrings();
  const copy = t.emailSignIn;
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<EmailCodeRefusal>();
  const working = useRef(false);

  const run = async (work: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await work();
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const send = (address: string) =>
    run(async () => {
      const result = await flow.send(address);
      if (!result.ok) {
        setError(result.code);
        return;
      }
      setSentTo(address.trim());
      setCode('');
    });
  const verify = (value: string) =>
    run(async () => {
      if (sentTo === undefined) return;
      const result = await flow.verify(sentTo, value);
      if (result.ok) finish({ kind: 'signed-in', email: result.email });
      else {
        setError(result.code);
        if (result.code === 'invalid-code') setCode('');
      }
    });

  const browser = (provider?: SocialProvider) =>
    run(async () => {
      const result = await flow.browser(provider);
      if (result.ok) finish({ kind: 'signed-in', email: result.email });
      else if (result.code !== 'cancelled') setError(result.code);
    });

  const providers: { id: SocialProvider; label: string; testID: string }[] = [
    { id: 'AppleOAuth', label: copy.apple, testID: 'email-sign-in-apple' },
    { id: 'GoogleOAuth', label: copy.google, testID: 'email-sign-in-google' },
  ];
  if (Platform.OS !== 'ios') providers.reverse();
  return (
    <KeyboardFormScroll
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.x5, gap: space.x4 }}
    >
      {sentTo === undefined ? (
        <>
          {providers.map((provider) => (
            <Button
              key={provider.id}
              testID={provider.testID}
              label={provider.label}
              disabled={busy}
              onPress={() => void browser(provider.id)}
            />
          ))}
          <Text tone="muted">{copy.emailHint}</Text>
          <TextField
            testID="email-sign-in-email"
            accessibilityLabel={copy.email}
            label={copy.email}
            placeholder={copy.email}
            value={email}
            onChangeText={setEmail}
            editable={!busy}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            inputMode="email"
            returnKeyType="send"
            invalid={error === 'invalid-email'}
            onSubmitEditing={() => void send(email)}
          />
          <Button
            testID="email-sign-in-send"
            label={copy.sendCode}
            tone="primary"
            busy={busy}
            disabled={!email.trim()}
            onPress={() => void send(email)}
          />
        </>
      ) : (
        <>
          <Text tone="muted">{copy.codeHint(sentTo)}</Text>
          <TextField
            testID="email-sign-in-code"
            accessibilityLabel={copy.code}
            label={copy.code}
            placeholder="000000"
            value={code}
            onChangeText={(value) => {
              const next = digits(value);
              setCode(next);
              if (next.length === CODE_LENGTH) void verify(next);
            }}
            editable={!busy}
            autoFocus
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={CODE_LENGTH}
            invalid={error === 'invalid-code'}
          />
          <Button
            testID="email-sign-in-verify"
            label={copy.verify}
            tone="primary"
            busy={busy}
            disabled={code.length !== CODE_LENGTH}
            onPress={() => void verify(code)}
          />
          <View style={{ gap: space.x2 }}>
            <Button
              testID="email-sign-in-resend"
              label={copy.resend}
              variant="text"
              disabled={busy}
              onPress={() => void send(sentTo)}
            />
            <Button
              testID="email-sign-in-change-email"
              label={copy.changeEmail}
              variant="text"
              disabled={busy}
              onPress={() => {
                setSentTo(undefined);
                setCode('');
                setError(undefined);
              }}
            />
          </View>
        </>
      )}
      {error === undefined ? null : (
        <Text tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {copy.refused[error]}
        </Text>
      )}
      <Button
        testID="email-sign-in-other"
        label={copy.otherMethods}
        variant="text"
        disabled={busy}
        onPress={() => void browser()}
      />
    </KeyboardFormScroll>
  );
}
