import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { ownerSignInOrigin } from '@botharness/host-client/owner-sign-in';
import { computerEnvironmentKey } from '../../src/host/conversation-environments';
import { hostSession } from '../../src/host/host-session';
import { conversationFilter } from '../../src/host/native-conversation-filter';
import { space } from '../../src/ui/design/tokens';
import { Button } from '../../src/ui/primitives/button';
import { KeyboardFormScroll } from '../../src/ui/primitives/keyboard-form';
import { Text } from '../../src/ui/primitives/text';
import { TextField } from '../../src/ui/primitives/text-field';
import { closeWorkspacePageWhenShown } from '../../src/ui/shell/workspace-paging';
import { useStrings } from '../../src/ui/strings';

export default function OwnerSignInScreen() {
  const t = useStrings();
  const router = useRouter();
  const [address, setAddress] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | undefined>(undefined);

  useFocusEffect(useCallback(() => () => pending.current?.abort(), []));

  const ready = address.trim() !== '' && username.trim() !== '' && password !== '';
  const submit = async () => {
    if (pending.current || !ready) return;
    const route = ownerSignInOrigin(address);
    if (route === undefined) {
      setError(t.teamSignIn.errors['insecure-transport'] ?? t.ownerSignIn.failed);
      return;
    }
    const request = new AbortController();
    pending.current = request;
    setBusy(true);
    setError(undefined);
    const computed = Constants.deviceName?.trim().slice(0, 60);
    const deviceName = computed || (Platform.OS === 'ios' ? 'iPhone' : 'Android phone');
    const result = await hostSession.signInOwner({
      route,
      username: username.trim(),
      password,
      deviceName,
      signal: request.signal,
    });
    pending.current = undefined;
    setBusy(false);
    setPassword('');
    if (request.signal.aborted) return;
    if (result.ok) {
      conversationFilter.set(computerEnvironmentKey(result.value.hostId));
      closeWorkspacePageWhenShown();
      router.dismissTo('/');
      return;
    }
    if (result.code === 'request-cancelled') return;
    const errors: Partial<Record<string, string>> = {
      ...t.teamSignIn.errors,
      'owner-sign-in-disabled': t.ownerSignIn.disabled,
      'already-paired': t.ownerSignIn.alreadyPaired,
      'storage-failed': t.ownerSignIn.storageFailed,
      'credentials-invalid': t.ownerSignIn.credentialsInvalid,
      'fingerprint-mismatch': t.ownerSignIn.fingerprintMismatch,
    };
    setError(
      (errors[result.code] ?? t.ownerSignIn.failed).replace(
        '{seconds}',
        String(result.retryAfterSeconds ?? 60),
      ),
    );
  };

  return (
    <KeyboardFormScroll contentContainerStyle={{ padding: space.x5, gap: space.x4 }}>
      <Text tone="muted">{t.ownerSignIn.hint}</Text>
      <TextField
        testID="owner-sign-in-address"
        label={t.teamSignIn.address}
        accessibilityLabel={t.teamSignIn.address}
        placeholder="https://…"
        value={address}
        onChangeText={setAddress}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        editable={!busy}
      />
      <TextField
        testID="owner-sign-in-username"
        label={t.teamSignIn.username}
        accessibilityLabel={t.teamSignIn.username}
        value={username}
        onChangeText={setUsername}
        textContentType="username"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={32}
        returnKeyType="next"
        editable={!busy}
      />
      <TextField
        testID="owner-sign-in-password"
        label={t.teamSignIn.password}
        accessibilityLabel={t.teamSignIn.password}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        autoComplete="current-password"
        maxLength={1024}
        returnKeyType="go"
        editable={!busy}
        onSubmitEditing={() => void submit()}
      />
      {error === undefined ? null : (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" tone="danger">
          {error}
        </Text>
      )}
      <Button
        testID="owner-sign-in-submit"
        label={t.teamSignIn.signIn}
        tone="primary"
        on="canvas"
        busy={busy}
        disabled={busy || !ready}
        onPress={() => void submit()}
      />
    </KeyboardFormScroll>
  );
}
