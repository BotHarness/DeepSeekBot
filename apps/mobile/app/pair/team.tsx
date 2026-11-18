import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { hostSession } from '../../src/host/host-session';
import type { SavedHost } from '@botharness/host-client/hosts';
import { nativeCarrier } from '../../src/host/native-carrier';
import { revokePairing } from '@botharness/host-client/pairing';
import {
  changeTeamDevicePassword,
  parseTeamInvitation,
  signInAgainInvitation,
  signInTeamDevice,
  type TeamErrorCode,
  type TeamInvitation,
} from '@botharness/host-client/team-client';
import { addressInvitation } from '@botharness/host-client/team-sign-in';
import {
  fingerprintGroups,
  pinnedFingerprint,
  teamAddressRoute,
} from '../../src/host/team-address';
import { useDesignTheme } from '../../src/ui/design/theme';
import { radius, space } from '../../src/ui/design/tokens';
import { Button } from '../../src/ui/primitives/button';
import { KeyboardFormScroll } from '../../src/ui/primitives/keyboard-form';
import { Text } from '../../src/ui/primitives/text';
import { TextField } from '../../src/ui/primitives/text-field';
import { useStrings } from '../../src/ui/strings';

const PASSWORD_MIN = 10;

type Step =
  | { kind: 'link' }
  | { kind: 'sign-in'; invitation: TeamInvitation; again?: boolean; pick?: boolean }
  | { kind: 'change'; host: SavedHost; current: string }
  | { kind: 'switch'; host: SavedHost }
  | { kind: 'address' }
  | { kind: 'fingerprint'; invitation: TeamInvitation };

function phoneName(): string {
  return Constants.deviceName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android phone');
}

function initialStep(
  link: string | undefined,
  hostId: string | undefined,
  pick = false,
): { step: Step; error?: TeamErrorCode | string } {
  if (hostId !== undefined) {
    const saved = hostSession.getState().hosts.find((host) => host.hostId === hostId);
    const invitation = saved === undefined ? undefined : signInAgainInvitation(saved);
    if (invitation !== undefined)
      return {
        step: pick
          ? { kind: 'sign-in', invitation: { ...invitation, username: '' }, pick: true }
          : { kind: 'sign-in', invitation, again: true },
      };
  }
  if (link === undefined) return { step: { kind: 'link' } };
  const parsed = parseTeamInvitation(`deepseekbot://team?i=${link}`);
  return parsed.ok
    ? { step: { kind: 'sign-in', invitation: parsed.value } }
    : { step: { kind: 'link' }, error: parsed.code };
}

export default function TeamSignInScreen() {
  const t = useStrings();
  const router = useRouter();
  const params = useLocalSearchParams<{ i?: string; host?: string; switch?: string }>();
  const first = useRef(
    initialStep(
      typeof params.i === 'string' ? params.i : undefined,
      typeof params.host === 'string' ? params.host : undefined,
      params.switch === '1',
    ),
  );
  const [step, setStep] = useState<Step>(first.current.step);
  const [error, setError] = useState<string | undefined>(first.current.error);
  const [retryAfter, setRetryAfter] = useState<number>();
  const [busy, setBusy] = useState(false);
  const theme = useDesignTheme();
  const [link, setLink] = useState('');
  const [address, setAddress] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const message = (code: string): string => {
    const copy = t.teamSignIn.errors as Record<string, string>;
    const text = copy[code] ?? copy['generic']!;
    return text.replace('{seconds}', String(retryAfter ?? 60));
  };

  const persist = async (host: SavedHost): Promise<boolean> => {
    const result = await hostSession.pairMember(host);
    if (!result.ok && result.code === 'identity-switch-required') {
      setStep({ kind: 'switch', host });
      return false;
    }
    if (!result.ok) {
      setError(result.code);
      return false;
    }
    return true;
  };

  const confirmSwitch = async (host: SavedHost): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const result = await hostSession.pairMember(host, { confirmedIdentitySwitch: true });
    if (result.ok) {
      router.dismissTo('/');
      return;
    }
    setBusy(false);
    setError(result.code);
  };

  const cancelSwitch = (host: SavedHost): void => {
    void revokePairing({ host, carrier: nativeCarrier() }).catch(() => undefined);
    setError(undefined);
    setStep({ kind: 'link' });
  };

  const lookUp = async (): Promise<void> => {
    const route = teamAddressRoute(address);
    if (route === undefined) return setError('insecure-transport');
    setBusy(true);
    setError(undefined);
    const found = await addressInvitation({
      route,
      username: username.trim().toLowerCase(),
      carrier: nativeCarrier(),
    });
    setBusy(false);
    if (!found.ok) return setError(found.code);
    const pinned = pinnedFingerprint(hostSession.getState().hosts, found.value.host.id);
    if (pinned !== undefined && pinned !== found.value.host.fingerprint)
      return setError('fingerprint-mismatch');
    setStep(
      pinned === undefined
        ? { kind: 'fingerprint', invitation: found.value }
        : { kind: 'sign-in', invitation: found.value },
    );
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

  const signIn = async (step: TeamInvitation, pick = false): Promise<void> => {
    const savedHost =
      typeof params.host === 'string'
        ? hostSession.getState().hosts.find((host) => host.hostId === params.host)
        : undefined;
    const fresh = savedHost === undefined ? step : (signInAgainInvitation(savedHost) ?? step);
    const invitation = pick ? { ...fresh, username: username.trim() } : fresh;
    if (invitation.username === '') return;
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
    if (saved) {
      router.dismissTo('/');
      return;
    }
    setBusy(false);
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
    if (saved) {
      router.dismissTo('/');
      return;
    }
    setBusy(false);
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
          <Button
            testID="team-use-username"
            label={t.teamSignIn.useUsername}
            variant="text"
            on="canvas"
            onPress={() => {
              setError(undefined);
              setStep({ kind: 'address' });
            }}
          />
        </>
      ) : step.kind === 'address' ? (
        <>
          <Text tone="muted">{t.teamSignIn.manualHint}</Text>
          <TextField
            testID="team-address"
            accessibilityLabel={t.teamSignIn.address}
            placeholder="https://…"
            value={address}
            onChangeText={(value) => {
              setAddress(value);
              setError(undefined);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="next"
            editable={!busy}
          />
          <TextField
            testID="team-username"
            accessibilityLabel={t.teamSignIn.username}
            placeholder={t.teamSignIn.username}
            value={username}
            onChangeText={(value) => {
              setUsername(value);
              setError(undefined);
            }}
            textContentType="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            editable={!busy}
            onSubmitEditing={() => void lookUp()}
          />
          {errorText}
          <Button
            testID="team-address-continue"
            label={t.teamSignIn.continue}
            tone="primary"
            on="canvas"
            busy={busy}
            disabled={busy || address.trim() === '' || username.trim() === ''}
            onPress={() => void lookUp()}
          />
        </>
      ) : step.kind === 'fingerprint' ? (
        <>
          <View style={{ gap: space.x1 }}>
            <Text variant="title" accessibilityRole="header">
              {t.teamSignIn.title.replace('{host}', step.invitation.host.name)}
            </Text>
            <Text tone="muted">{t.teamSignIn.fingerprintHint}</Text>
          </View>
          <View
            style={{
              padding: space.x5,
              borderRadius: radius.lg,
              backgroundColor: theme.layer.raised.fill,
            }}
          >
            <Text
              testID="team-fingerprint"
              selectable
              style={{ fontFamily: theme.mono, textAlign: 'center' }}
            >
              {fingerprintGroups(step.invitation.host.fingerprint)}
            </Text>
          </View>
          <Button
            testID="team-fingerprint-matches"
            label={t.teamSignIn.fingerprintMatches}
            tone="primary"
            on="canvas"
            onPress={() => setStep({ kind: 'sign-in', invitation: step.invitation })}
          />
          <Button
            testID="team-fingerprint-cancel"
            label={t.cancel}
            on="canvas"
            onPress={() => setStep({ kind: 'address' })}
          />
        </>
      ) : step.kind === 'switch' ? (
        <>
          <View style={{ gap: space.x1 }}>
            <Text variant="title" accessibilityRole="header">
              {t.teamSignIn.switchTitle}
            </Text>
            <Text tone="muted">
              {t.teamSignIn.switchBody.replace('{name}', step.host.member?.displayName ?? '')}
            </Text>
          </View>
          {errorText}
          <Button
            testID="team-switch-confirm"
            label={t.teamSignIn.switchConfirm}
            tone="danger"
            on="canvas"
            busy={busy}
            disabled={busy}
            onPress={() => void confirmSwitch(step.host)}
          />
          <Button
            testID="team-switch-cancel"
            label={t.cancel}
            on="canvas"
            disabled={busy}
            onPress={() => cancelSwitch(step.host)}
          />
        </>
      ) : step.kind === 'sign-in' ? (
        <>
          <View style={{ gap: space.x1 }}>
            <Text variant="title" accessibilityRole="header">
              {t.teamSignIn.title.replace('{host}', step.invitation.host.name)}
            </Text>
            <Text tone="muted">
              {step.pick === true
                ? t.teamSignIn.switchHint
                : t.teamSignIn.as.replace('{username}', step.invitation.username)}
            </Text>
            {step.again === true ? <Text tone="muted">{t.teamSignIn.againHint}</Text> : null}
          </View>
          {step.pick === true ? (
            <TextField
              testID="team-username"
              accessibilityLabel={t.teamSignIn.username}
              placeholder={t.teamSignIn.username}
              value={username}
              onChangeText={(value) => {
                setUsername(value);
                setError(undefined);
              }}
              textContentType="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              editable={!busy}
            />
          ) : null}
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
            onSubmitEditing={() => void signIn(step.invitation, step.pick === true)}
          />
          {step.again === true ? null : (
            <Text variant="meta" tone="muted">
              {t.teamSignIn.passwordHint}
            </Text>
          )}
          {errorText}
          <Button
            testID="team-sign-in"
            label={t.teamSignIn.signIn}
            tone="primary"
            on="canvas"
            busy={busy}
            disabled={busy || password === '' || (step.pick === true && username.trim() === '')}
            onPress={() => void signIn(step.invitation, step.pick === true)}
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
