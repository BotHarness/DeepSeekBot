import { useRef, useState } from 'react';
import { Image, Platform, View } from 'react-native';

import {
  visibleBrowserRefusal,
  type EmailCodeFlow,
  type EmailCodeOutcome,
  type EmailCodeRefusal,
  type PasswordOutcome,
  type SocialProvider,
} from '../../host/connect-account';
import { useDesignTheme } from '../design/theme';
import { edge, radius, signInBrand, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { Text } from '../primitives/text';
import { TextField } from '../primitives/text-field';
import { useStrings } from '../strings';
import { SignInBrandButton } from './sign-in-brand-button';

const APP_ICON = {
  light: require('../../../assets/app-icons/deepseekbot-light-preview.png'),
  dark: require('../../../assets/app-icons/deepseekbot-dark-preview.png'),
};

function Heading({ title, detail, icon }: { title: string; detail: string; icon?: boolean }) {
  const theme = useDesignTheme();
  return (
    <View style={{ alignItems: 'center', gap: space.x3, paddingBottom: space.x3 }}>
      {icon ? (
        <Image
          source={APP_ICON[theme.scheme]}
          accessibilityIgnoresInvertColors
          style={{
            width: signInBrand.appIcon,
            height: signInBrand.appIcon,
            borderRadius: radius.lg,
            borderWidth: edge.hairline,
            borderColor: theme.color.border,
            marginBottom: space.x3,
          }}
        />
      ) : null}
      <Text variant="display" accessibilityRole="header" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      <Text tone="muted" style={{ textAlign: 'center' }}>
        {detail}
      </Text>
    </View>
  );
}

function OrDivider({ label }: { label: string }) {
  const theme = useDesignTheme();
  const line = { flex: 1, height: edge.hairline, backgroundColor: theme.layer.sheet.divider };
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.x4 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={line} />
      <Text variant="meta" tone="muted">
        {label}
      </Text>
      <View style={line} />
    </View>
  );
}

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
  const [mode, setMode] = useState<'password' | 'register' | 'code' | 'reset'>(
    flow.password ? 'password' : 'code',
  );
  const [password, setPassword] = useState('');
  const [verifyPassword, setVerifyPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
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
  const passwordResult = (result: PasswordOutcome) => {
    if (!result.ok) {
      setError(result.code);
      if (result.code === 'invalid-code') setCode('');
      return;
    }
    setPassword('');
    if (result.kind === 'signed-in') finish({ kind: 'signed-in', email: result.email });
    else {
      setVerifyPassword(true);
      setSentTo(email.trim());
      setCode('');
    }
  };
  const submitPassword = () =>
    run(async () => {
      if (!flow.password || !password || !email.trim()) return;
      passwordResult(await flow.password.submit(email, password, mode === 'register'));
    });
  const reset = () =>
    run(async () => {
      if (!flow.password) return;
      const result = await flow.password.reset(email);
      if (!result.ok) setError(result.code);
      else setResetSent(true);
    });
  const changeMode = (next: typeof mode) => {
    setMode(next);
    setPassword('');
    setError(undefined);
    setResetSent(false);
    setVerifyPassword(false);
  };
  const verify = (value: string) =>
    run(async () => {
      if (sentTo === undefined) return;
      if (verifyPassword && flow.password) {
        passwordResult(await flow.password.verify(value));
        return;
      }
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
      else setError(visibleBrowserRefusal(result.code));
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
      contentContainerStyle={{
        paddingHorizontal: space.x5,
        paddingTop: space.x3,
        paddingBottom: space.x6,
        gap: space.x4,
      }}
    >
      {sentTo === undefined ? (
        <>
          <Heading
            icon
            title={
              mode === 'register'
                ? copy.register
                : mode === 'reset'
                  ? copy.resetTitle
                  : copy.heading
            }
            detail={mode === 'reset' ? copy.resetDetail : copy.headingDetail}
          />
          {providers.map((provider) => (
            <SignInBrandButton
              key={provider.id}
              provider={provider.id}
              testID={provider.testID}
              label={provider.label}
              disabled={busy}
              onPress={() => void browser(provider.id)}
            />
          ))}
          <OrDivider label={copy.or} />
          <TextField
            testID="email-sign-in-email"
            accessibilityLabel={copy.email}
            label={copy.email}
            placeholder={copy.emailPlaceholder}
            value={email}
            onChangeText={setEmail}
            editable={!busy}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            inputMode="email"
            returnKeyType={mode === 'password' || mode === 'register' ? 'done' : 'send'}
            invalid={error === 'invalid-email'}
            onSubmitEditing={() => {
              if (mode === 'code') void send(email);
              else if (mode === 'reset') void reset();
            }}
          />
          {mode === 'password' || mode === 'register' ? (
            <>
              <TextField
                testID="email-sign-in-password"
                accessibilityLabel={copy.password}
                label={copy.password}
                placeholder={copy.password}
                value={password}
                onChangeText={setPassword}
                editable={!busy}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                textContentType={mode === 'register' ? 'newPassword' : 'password'}
                returnKeyType="go"
                invalid={error === 'invalid-credentials' || error === 'sign-up-failed'}
                onSubmitEditing={() => void submitPassword()}
              />
              <Button
                testID="email-sign-in-password-submit"
                label={mode === 'register' ? copy.register : copy.title}
                tone="primary"
                busy={busy}
                disabled={!email.trim() || !password}
                onPress={() => void submitPassword()}
              />
              <Button
                testID="email-sign-in-forgot"
                label={copy.forgotPassword}
                variant="text"
                disabled={busy}
                onPress={() => changeMode('reset')}
              />
            </>
          ) : (
            <Button
              testID="email-sign-in-send"
              label={mode === 'reset' ? copy.sendReset : copy.sendCode}
              tone="primary"
              busy={busy}
              disabled={!email.trim()}
              onPress={() => {
                if (mode === 'reset') void reset();
                else void send(email);
              }}
            />
          )}
          {resetSent ? <Text accessibilityLiveRegion="polite">{copy.resetSent}</Text> : null}
          {flow.password ? (
            <View style={{ gap: space.x2 }}>
              <Button
                testID="email-sign-in-mode"
                label={mode === 'code' || mode === 'reset' ? copy.usePassword : copy.useCode}
                variant="text"
                disabled={busy}
                onPress={() =>
                  changeMode(mode === 'code' || mode === 'reset' ? 'password' : 'code')
                }
              />
              <Button
                testID="email-sign-in-register"
                label={mode === 'register' ? copy.haveAccount : copy.register}
                variant="text"
                disabled={busy}
                onPress={() => changeMode(mode === 'register' ? 'password' : 'register')}
              />
            </View>
          ) : null}
        </>
      ) : (
        <>
          <Heading title={copy.codeTitle} detail={copy.codeHint(sentTo)} />
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
            {verifyPassword ? null : (
              <Button
                testID="email-sign-in-resend"
                label={copy.resend}
                variant="text"
                disabled={busy}
                onPress={() => void send(sentTo)}
              />
            )}
            <Button
              testID="email-sign-in-change-email"
              label={copy.changeEmail}
              variant="text"
              disabled={busy}
              onPress={() => {
                setSentTo(undefined);
                setVerifyPassword(false);
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
