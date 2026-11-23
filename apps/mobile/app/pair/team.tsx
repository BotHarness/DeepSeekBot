import Constants from 'expo-constants';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { computerEnvironmentKey } from '../../src/host/conversation-environments';
import { hostSession } from '../../src/host/host-session';
import { conversationFilter } from '../../src/host/native-conversation-filter';
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
import {
  discoverHostAddress,
  type HostAddressDiscovery,
} from '@botharness/host-client/password-sign-in';
import { pinnedFingerprint } from '../../src/host/team-address';
import { space } from '../../src/ui/design/tokens';
import { Button } from '../../src/ui/primitives/button';
import { CopyableFingerprint } from '../../src/ui/primitives/copyable-fingerprint';
import { SettingsRow, SettingsSection } from '../../src/ui/primitives/settings-row';
import { SHEET_GROUP } from '../../src/ui/chat/sheet';
import { DesktopPath } from '../../src/ui/shell/desktop-path';
import { KeyboardFormScroll } from '../../src/ui/primitives/keyboard-form';
import { Text } from '../../src/ui/primitives/text';
import { labelInField } from '../../src/ui/primitives/field-label';
import { TextField } from '../../src/ui/primitives/text-field';
import { closeWorkspacePageWhenShown } from '../../src/ui/shell/workspace-paging';
import { useStrings } from '../../src/ui/strings';

const PASSWORD_MIN = 10;

type Step =
  | { kind: 'link' }
  | { kind: 'sign-in'; invitation: TeamInvitation; again?: boolean; pick?: boolean }
  | { kind: 'change'; host: SavedHost; current: string }
  | { kind: 'switch'; host: SavedHost }
  | { kind: 'address' }
  | { kind: 'connecting' }
  | { kind: 'choose'; found: HostAddressDiscovery }
  | { kind: 'host'; found: HostAddressDiscovery }
  | { kind: 'needs-code'; found: HostAddressDiscovery; chosen?: boolean };

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.x2 }}>
      {labelInField ? null : (
        <Text variant="meta" tone="muted">
          {label}
        </Text>
      )}
      {children}
    </View>
  );
}

function phoneName(): string {
  return Constants.deviceName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android phone');
}

function initialStep(
  link: string | undefined,
  hostId: string | undefined,
  pick = false,
  address?: string,
): { step: Step; error?: TeamErrorCode | string } {
  if (address !== undefined) return { step: { kind: 'connecting' } };
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
  const params = useLocalSearchParams<{
    i?: string;
    host?: string;
    switch?: string;
    address?: string;
  }>();
  const first = useRef(
    initialStep(
      typeof params.i === 'string' ? params.i : undefined,
      typeof params.host === 'string' ? params.host : undefined,
      params.switch === '1',
      typeof params.address === 'string' ? params.address : undefined,
    ),
  );
  const [step, setStep] = useState<Step>(first.current.step);
  const [error, setError] = useState<string | undefined>(first.current.error);
  const [retryAfter, setRetryAfter] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const [address, setAddress] = useState(typeof params.address === 'string' ? params.address : '');
  const pending = useRef<AbortController | undefined>(undefined);
  const [fingerprintShown, setFingerprintShown] = useState(false);
  const discovered = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!discovered.current && first.current.step.kind === 'connecting') {
        discovered.current = true;
        void discover(address);
      }
      return () => pending.current?.abort();
    }, []),
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const message = (code: string): string => {
    const copy: Record<string, string> = {
      ...(t.teamSignIn.errors as Record<string, string>),
      'owner-sign-in-disabled': t.ownerSignIn.disabled,
      'already-paired': t.ownerSignIn.alreadyPaired,
      ...(step.kind === 'host' ? { 'credentials-invalid': t.ownerSignIn.credentialsInvalid } : {}),
    };
    const text = copy[code] ?? copy['generic']!;
    return text.replace('{seconds}', String(retryAfter ?? 60));
  };

  const land = (hostId: string): void => {
    conversationFilter.set(computerEnvironmentKey(hostId));
    closeWorkspacePageWhenShown();
    router.dismissTo('/');
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
      land(host.hostId);
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

  const discover = async (input: string): Promise<void> => {
    const request = new AbortController();
    pending.current?.abort();
    pending.current = request;
    setBusy(true);
    setError(undefined);
    setStep({ kind: 'connecting' });
    const found = await discoverHostAddress({
      carrier: nativeCarrier(),
      input,
      signal: request.signal,
    });
    if (request.signal.aborted) return;
    pending.current = undefined;
    setBusy(false);
    if (!found.ok) {
      setStep({ kind: 'address' });
      return setError(found.code);
    }
    const pinned = pinnedFingerprint(hostSession.getState().hosts, found.value.host.id);
    if (pinned !== undefined && pinned !== found.value.host.fingerprint) {
      setStep({ kind: 'address' });
      return setError('fingerprint-mismatch');
    }
    setStep(
      found.value.signIn?.password === false
        ? { kind: 'needs-code', found: found.value }
        : { kind: 'choose', found: found.value },
    );
  };

  const passwordSignIn = async (found: HostAddressDiscovery): Promise<void> => {
    if (pending.current || username.trim() === '' || password === '') return;
    const request = new AbortController();
    pending.current = request;
    setBusy(true);
    setError(undefined);
    const current = password;
    const result = await hostSession.signInPassword({
      route: found.route,
      username: username.trim(),
      password: current,
      deviceName: phoneName(),
      signal: request.signal,
    });
    pending.current = undefined;
    setPassword('');
    if (request.signal.aborted) return;
    if (!result.ok) {
      setBusy(false);
      setRetryAfter(result.retryAfterSeconds);
      if (result.code === 'request-cancelled') return;
      if (result.code === 'password-sign-in-unavailable')
        return setStep({ kind: 'needs-code', found });
      return setError(result.code);
    }
    const { role, ...host } = result.value;
    if (role === 'owner') return land(host.hostId);
    if (host.member?.mustChangePassword === true) {
      setBusy(false);
      return setStep({ kind: 'change', host, current });
    }
    if (await persist(host)) return land(host.hostId);
    setBusy(false);
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
      land(result.value.hostId);
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
      land(result.value.hostId);
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
          <Labeled label={t.teamSignIn.address}>
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
              returnKeyType="go"
              editable={!busy}
              onSubmitEditing={() => void discover(address)}
            />
          </Labeled>
          {errorText}
          <Button
            testID="team-address-continue"
            label={t.teamSignIn.continue}
            tone="primary"
            on="canvas"
            busy={busy}
            disabled={busy || address.trim() === ''}
            onPress={() => void discover(address)}
          />
        </>
      ) : step.kind === 'connecting' ? (
        <Text tone="muted" accessibilityLiveRegion="polite">
          {t.teamSignIn.connecting}
        </Text>
      ) : step.kind === 'choose' ? (
        <>
          <Text variant="title" accessibilityRole="header">
            {t.teamSignIn.connectTo.replace('{host}', step.found.host.name)}
          </Text>
          <SettingsSection on={SHEET_GROUP}>
            <SettingsRow
              testID="team-choose-password"
              on={SHEET_GROUP}
              title={t.teamSignIn.choosePassword}
              detail={t.teamSignIn.choosePasswordDetail}
              icon="account"
              disclosure
              onPress={() => {
                setError(undefined);
                setFingerprintShown(false);
                setStep({ kind: 'host', found: step.found });
              }}
            />
            <SettingsRow
              testID="team-choose-approve"
              on={SHEET_GROUP}
              title={t.teamSignIn.chooseApprove}
              detail={t.teamSignIn.chooseApproveDetail}
              icon="computer"
              disclosure
              onPress={() => setStep({ kind: 'needs-code', found: step.found, chosen: true })}
            />
          </SettingsSection>
        </>
      ) : step.kind === 'needs-code' ? (
        <>
          <Text variant="title" accessibilityRole="header">
            {t.teamSignIn.connectTo.replace('{host}', step.found.host.name)}
          </Text>
          <Text tone="muted">
            {step.chosen === true ? t.teamSignIn.approveHint : t.teamSignIn.needsCode}
          </Text>
          <DesktopPath steps={t.pairChoice.connectPath} />
          <Button
            testID="team-scan-code"
            label={t.teamSignIn.scanCode}
            tone="primary"
            on="canvas"
            onPress={() => router.back()}
          />
        </>
      ) : step.kind === 'host' ? (
        <>
          <View style={{ gap: space.x1 }}>
            <Text variant="title" accessibilityRole="header">
              {t.teamSignIn.title.replace('{host}', step.found.host.name)}
            </Text>
          </View>
          <Labeled label={t.teamSignIn.username}>
            <TextField
              testID="team-username"
              accessibilityLabel={t.teamSignIn.username}
              value={username}
              onChangeText={(value) => {
                setUsername(value);
                setError(undefined);
              }}
              textContentType="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={32}
              returnKeyType="next"
              editable={!busy}
            />
          </Labeled>
          <Labeled label={t.teamSignIn.password}>
            <TextField
              testID="team-password"
              accessibilityLabel={t.teamSignIn.password}
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
              maxLength={1024}
              returnKeyType="go"
              editable={!busy}
              onSubmitEditing={() => void passwordSignIn(step.found)}
            />
          </Labeled>
          {errorText}
          <Button
            testID="team-sign-in"
            label={t.teamSignIn.signIn}
            tone="primary"
            on="canvas"
            busy={busy}
            disabled={busy || username.trim() === '' || password === ''}
            onPress={() => void passwordSignIn(step.found)}
          />
          <Button
            testID="team-fingerprint-toggle"
            label={fingerprintShown ? t.teamSignIn.hideFingerprint : t.teamSignIn.showFingerprint}
            variant="text"
            on="canvas"
            onPress={() => setFingerprintShown(!fingerprintShown)}
          />
          {fingerprintShown ? (
            <CopyableFingerprint
              testID="team-fingerprint"
              fingerprint={step.found.host.fingerprint}
            />
          ) : null}
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
            <Labeled label={t.teamSignIn.username}>
              <TextField
                testID="team-username"
                accessibilityLabel={t.teamSignIn.username}
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
            </Labeled>
          ) : null}
          <Labeled label={t.teamSignIn.password}>
            <TextField
              testID="team-password"
              accessibilityLabel={t.teamSignIn.password}
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
          </Labeled>
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
          <Labeled label={t.teamSignIn.newPassword}>
            <TextField
              testID="team-new-password"
              accessibilityLabel={t.teamSignIn.newPassword}
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
          </Labeled>
          <Labeled label={t.teamSignIn.confirmPassword}>
            <TextField
              testID="team-confirm-password"
              accessibilityLabel={t.teamSignIn.confirmPassword}
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
          </Labeled>
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
