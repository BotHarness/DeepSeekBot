import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Platform, View } from 'react-native';

import { hostSession } from '../../src/host/host-session';
import type { SavedHost } from '../../src/host/hosts';
import { nativeCarrier } from '../../src/host/native-carrier';
import {
  changeTeamDevicePassword,
  parseTeamInvitation,
  signInTeamDevice,
  type TeamErrorCode,
  type TeamInvitation,
} from '../../src/host/team-client';
import { space } from '../../src/ui/design/tokens';
import { Button } from '../../src/ui/primitives/button';
import { KeyboardFormScroll } from '../../src/ui/primitives/keyboard-form';
import { Text } from '../../src/ui/primitives/text';
import { TextField } from '../../src/ui/primitives/text-field';
import { useStrings } from '../../src/ui/strings';

const PASSWORD_MIN = 10;

type Step =
  | { kind: 'link' }
  | { kind: 'sign-in'; invitation: TeamInvitation }
  | { kind: 'change'; host: SavedHost; current: string };

function phoneName(): string {
  return Constants.deviceName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android phone');
}

function initialStep(link: string | undefined): { step: Step; error?: TeamErrorCode | string } {
  if (link === undefined) return { step: { kind: 'link' } };
  const parsed = parseTeamInvitation(`deepseekbot://team?i=${link}`);
  return parsed.ok
    ? { step: { kind: 'sign-in', invitation: parsed.value } }
    : { step: { kind: 'link' }, error: parsed.code };
}

export default function TeamSignInScreen() {
  const t = useStrings();
  const router = useRouter();
  const params = useLocalSearchParams<{ i?: string }>();
  const first = useRef(initialStep(typeof params.i === 'string' ? params.i : undefined));
  const [step, setStep] = useState<Step>(first.current.step);
  const [error, setError] = useState<string | undefined>(first.current.error);
  const [retryAfter, setRetryAfter] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const [password, setPassword] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const message = (code: string): string => {
    const copy = t.teamSignIn.errors as Record<string, string>;
    const text = copy[code] ?? copy['generic']!;
    return text.replace('{seconds}', String(retryAfter ?? 60));
  };

  const persist = async (host: SavedHost): Promise<boolean> => {
    let result = await hostSession.pairMember(host);
    if (!result.ok && result.code === 'identity-switch-required') {
      const confirmed = await new Promise<boolean>((resolve) =>
        Alert.alert(
          t.teamSignIn.switchTitle,
          t.teamSignIn.switchBody.replace('{name}', host.member?.displayName ?? ''),
          [
            { text: t.cancel, style: 'cancel', onPress: () => resolve(false) },
            {
              text: t.teamSignIn.switchConfirm,
              style: 'destructive',
              onPress: () => resolve(true),
            },
          ],
        ),
      );
      if (!confirmed) return false;
      result = await hostSession.pairMember(host, { confirmedIdentitySwitch: true });
    }
    if (!result.ok) {
      setError(result.code);
      return false;
    }
    return true;
  };

  const openLink = (): void => {
    const parsed = parseTeamInvitation(link.trim());
    if (!parsed.ok) {
      setError(parsed.code);
      return;
    }
    setError(undefined);
    setStep({ kind: 'sign-in', invitation: parsed.value });
  };

  const signIn = async (invitation: TeamInvitation): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const result = await signInTeamDevice({
      carrier: nativeCarrier(),
      invitation,
      password,
      deviceName: phoneName(),
    });
    setBusy(false);
    if (!result.ok) {
      setRetryAfter(result.retryAfterSeconds);
      setError(result.code);
      setPassword('');
      return;
    }
    if (result.value.member?.mustChangePassword === true) {
      setStep({ kind: 'change', host: result.value, current: password });
      setPassword('');
      return;
    }
    setBusy(true);
    const saved = await persist(result.value);
    setBusy(false);
    if (saved) router.dismissTo('/');
  };

  const change = async (host: SavedHost, current: string): Promise<void> => {
    if (next.length < PASSWORD_MIN) return setError('password-weak');
    if (next !== confirm) return setError('mismatch');
    if (next === current) return setError('password-reused');
    setBusy(true);
    setError(undefined);
    const result = await changeTeamDevicePassword({
      carrier: nativeCarrier(),
      host,
      current,
      next,
    });
    if (!result.ok) {
      setBusy(false);
      setRetryAfter(result.retryAfterSeconds);
      setError(result.code);
      return;
    }
    const saved = await persist(result.value);
    setBusy(false);
    if (saved) router.dismissTo('/');
  };

  const errorText =
    error === undefined ? null : (
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" tone="danger">
        {message(error)}
      </Text>
    );

  return (
    <KeyboardFormScroll contentContainerStyle={{ padding: space.x5, gap: space.x4 }}>
      {step.kind === 'link' ? (
        <>
          <Text tone="muted">{t.teamSignIn.linkHint}</Text>
          <TextField
            testID="team-invitation-link"
            accessibilityLabel={t.teamSignIn.link}
            value={link}
            onChangeText={(value) => {
              setLink(value);
              setError(undefined);
            }}
            placeholder="deepseekbot://team?i=…"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={openLink}
          />
          {errorText}
          <Button
            testID="team-invitation-open"
            label={t.teamSignIn.continue}
            tone="primary"
            on="canvas"
            disabled={link.trim() === ''}
            onPress={openLink}
          />
        </>
      ) : step.kind === 'sign-in' ? (
        <>
          <View style={{ gap: space.x1 }}>
            <Text variant="title" accessibilityRole="header">
              {t.teamSignIn.title.replace('{host}', step.invitation.host.name)}
            </Text>
            <Text tone="muted">
              {t.teamSignIn.as.replace('{username}', step.invitation.username)}
            </Text>
          </View>
          <TextField
            testID="team-password"
            accessibilityLabel={t.teamSignIn.password}
            placeholder={t.teamSignIn.password}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setError(undefined);
            }}
            secureTextEntry
            textContentType="password"
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            editable={!busy}
            onSubmitEditing={() => void signIn(step.invitation)}
          />
          <Text variant="meta" tone="muted">
            {t.teamSignIn.passwordHint}
          </Text>
          {errorText}
          <Button
            testID="team-sign-in"
            label={t.teamSignIn.signIn}
            tone="primary"
            on="canvas"
            busy={busy}
            disabled={busy || password === ''}
            onPress={() => void signIn(step.invitation)}
          />
        </>
      ) : (
        <>
          <View style={{ gap: space.x1 }}>
            <Text variant="title" accessibilityRole="header">
              {t.teamSignIn.changeTitle}
            </Text>
            <Text tone="muted">{t.teamSignIn.changeHint}</Text>
          </View>
          <TextField
            testID="team-new-password"
            accessibilityLabel={t.teamSignIn.newPassword}
            placeholder={t.teamSignIn.newPassword}
            value={next}
            onChangeText={(value) => {
              setNext(value);
              setError(undefined);
            }}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
          <TextField
            testID="team-confirm-password"
            accessibilityLabel={t.teamSignIn.confirmPassword}
            placeholder={t.teamSignIn.confirmPassword}
            value={confirm}
            onChangeText={(value) => {
              setConfirm(value);
              setError(undefined);
            }}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            editable={!busy}
            onSubmitEditing={() => void change(step.host, step.current)}
          />
          <Text variant="meta" tone="muted">
            {t.teamSignIn.rule.replace('{min}', String(PASSWORD_MIN))}
          </Text>
          {errorText}
          <Button
            testID="team-change-password"
            label={t.teamSignIn.continue}
            tone="primary"
            on="canvas"
            busy={busy}
            disabled={busy || next === '' || confirm === ''}
            onPress={() => void change(step.host, step.current)}
          />
        </>
      )}
    </KeyboardFormScroll>
  );
}
