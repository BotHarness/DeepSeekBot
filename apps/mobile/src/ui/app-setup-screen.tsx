import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';

import {
  cancelAppSetup,
  listAppSetups,
  pollAppSetup,
  startAppSetup,
  submitAppCredentials,
  verifyAppSetup,
  type AppPlatform,
  type AppSetupAttempt,
  type AppSetupDescriptor,
  type AppSetupResult,
  type AppSetupsResult,
} from '../host/host-app-setup';
import type { HostClient } from '../host/host-settings';
import { SHEET_GROUP } from './chat/sheet';
import { space } from './design/tokens';
import { confirmDestructive } from './primitives/app-dialog';
import { Button } from './primitives/button';
import { DrawerHeader } from './primitives/drawer-header';
import { KeyboardFormScroll } from './primitives/keyboard-form';
import { SettingsForm } from './primitives/settings-form';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { Text } from './primitives/text';
import { TextField } from './primitives/text-field';
import { useStrings } from './strings';

export interface AppSetupPort {
  setups(): Promise<AppSetupsResult>;
  start(platform: AppPlatform): Promise<AppSetupResult>;
  poll(attemptId: string): Promise<AppSetupResult>;
  cancel(attemptId: string): Promise<AppSetupResult>;
  credentials(
    attemptId: string,
    appId: string,
    appSecret: string,
    domain: 'lark' | 'feishu',
  ): Promise<AppSetupResult>;
  verify(attemptId: string, verifyCode: string): Promise<AppSetupResult>;
}

export function appSetupPort(client: HostClient): AppSetupPort {
  return {
    setups: () => listAppSetups(client),
    start: (platform) => startAppSetup(client, platform),
    poll: (attemptId) => pollAppSetup(client, attemptId),
    cancel: (attemptId) => cancelAppSetup(client, attemptId),
    credentials: (attemptId, appId, appSecret, domain) =>
      submitAppCredentials(client, attemptId, appId, appSecret, domain),
    verify: (attemptId, verifyCode) => verifyAppSetup(client, attemptId, verifyCode),
  };
}

type LoadState = 'loading' | 'ready' | 'error';

export function AppSetupView({ port, onClose }: { port: AppSetupPort; onClose(): void }) {
  const copy = useStrings().appSetup;
  const [load, setLoad] = useState<LoadState>('loading');
  const [descriptors, setDescriptors] = useState<AppSetupDescriptor[]>([]);
  const [attempt, setAttempt] = useState<AppSetupAttempt | undefined>(undefined);
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [domain, setDomain] = useState<'lark' | 'feishu'>('feishu');
  const [verifyCode, setVerifyCode] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const working = useRef(false);

  const reload = useCallback(async () => {
    setLoad('loading');
    const result = await port.setups();
    if (result.kind === 'ok') {
      setDescriptors(result.setups);
      setLoad('ready');
    } else {
      setLoad('error');
      if (result.kind === 'rejected') setMessage(result.message);
    }
  }, [port]);

  const didInitialLoad = useRef(false);
  if (!didInitialLoad.current) {
    didInitialLoad.current = true;
    void reload();
  }

  const apply = (result: AppSetupResult): boolean => {
    if (result.kind === 'ok') {
      setAttempt(result.attempt);
      setMessage('');
      return true;
    }
    if (result.kind === 'rejected')
      setMessage(result.message === '' ? copy.rejected : result.message);
    else if (result.kind === 'refused') setMessage(copy.refused);
    else setMessage(copy.saveFailed);
    return false;
  };

  const run = async (work: () => Promise<AppSetupResult>, clearSecrets = false) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      const result = await work();
      if (clearSecrets) {
        setAppSecret('');
        setVerifyCode('');
        setRevealed(false);
      }
      apply(result);
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  const cancelSetup = () => {
    if (attempt === undefined || busy) return;
    confirmDestructive(copy.cancelTitle, copy.cancelBody, copy.cancel, () => {
      void run(() => port.cancel(attempt.attemptId));
    });
  };

  const leave = () => {
    setAttempt(undefined);
    setAppId('');
    setAppSecret('');
    setVerifyCode('');
    setMessage('');
    void reload();
  };

  const header = (
    <View style={{ paddingHorizontal: space.x5, paddingTop: space.x3 }}>
      <DrawerHeader title={copy.title} onBack={attempt === undefined ? onClose : leave} />
    </View>
  );

  if (attempt !== undefined) {
    const title = attempt.name ?? copy.platform(attempt.platform);
    return (
      <KeyboardFormScroll
        testID="app-setup-attempt"
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: space.x3, padding: space.x5 }}
      >
        <View style={{ paddingTop: space.x3 }}>
          <DrawerHeader title={title} onBack={leave} onClose={onClose} />
        </View>
        <Text variant="meta" tone="muted">
          {copy.state(attempt.state)}
        </Text>
        {attempt.qrDataUrl === undefined ? null : (
          <Image
            testID="app-setup-qr"
            source={{ uri: attempt.qrDataUrl }}
            style={{ width: 240, height: 240 }}
            contentFit="contain"
            accessibilityLabel={copy.qr}
          />
        )}
        {attempt.state === 'credentials' ? (
          <>
            <TextField
              testID="app-setup-app-id"
              label={copy.appId}
              accessibilityLabel={copy.appId}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              value={appId}
              onChangeText={setAppId}
            />
            <TextField
              testID="app-setup-app-secret"
              label={copy.appSecret}
              accessibilityLabel={copy.appSecret}
              secureTextEntry={!revealed}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              value={appSecret}
              onChangeText={setAppSecret}
            />
            <Button
              label={revealed ? copy.hide : copy.reveal}
              testID="app-setup-reveal"
              onPress={() => setRevealed((shown) => !shown)}
            />
            <View style={{ flexDirection: 'row', gap: space.x2 }}>
              <Button
                label={copy.domainFeishu}
                testID="app-setup-domain-feishu"
                selected={domain === 'feishu'}
                onPress={() => setDomain('feishu')}
              />
              <Button
                label={copy.domainLark}
                testID="app-setup-domain-lark"
                selected={domain === 'lark'}
                onPress={() => setDomain('lark')}
              />
            </View>
            <Button
              label={copy.submitCredentials}
              testID="app-setup-credentials"
              busy={busy}
              disabled={busy || appId.length === 0 || appSecret.length === 0}
              onPress={() =>
                void run(() => port.credentials(attempt.attemptId, appId, appSecret, domain), true)
              }
            />
          </>
        ) : null}
        {attempt.state === 'needs_verification' ? (
          <>
            <TextField
              testID="app-setup-verify"
              label={copy.verifyCode}
              accessibilityLabel={copy.verifyCode}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              value={verifyCode}
              onChangeText={setVerifyCode}
            />
            <Button
              label={copy.verify}
              testID="app-setup-verify-submit"
              busy={busy}
              disabled={busy || !/^\d{4,8}$/.test(verifyCode)}
              onPress={() => void run(() => port.verify(attempt.attemptId, verifyCode), true)}
            />
          </>
        ) : null}
        {!['ready', 'cancelled', 'expired', 'failed', 'credentials', 'needs_verification'].includes(
          attempt.state,
        ) ? (
          <Button
            label={copy.checkStatus}
            testID="app-setup-poll"
            busy={busy}
            onPress={() => void run(() => port.poll(attempt.attemptId))}
          />
        ) : null}
        {attempt.state === 'ready' ? (
          <>
            <Text tone="muted">
              {copy.readyDetail(attempt.accountRef ?? '', attempt.connected === true)}
            </Text>
            <Button label={copy.done} testID="app-setup-done" onPress={leave} />
          </>
        ) : null}
        {!['ready', 'cancelled', 'expired'].includes(attempt.state) ? (
          <Button
            label={copy.cancel}
            testID="app-setup-cancel"
            tone="danger"
            disabled={busy}
            onPress={cancelSetup}
          />
        ) : null}
        {['cancelled', 'expired', 'failed'].includes(attempt.state) ? (
          <Button label={copy.startAgain} testID="app-setup-again" onPress={leave} />
        ) : null}
        {message === '' ? null : (
          <Text accessibilityRole="alert" tone="danger">
            {message}
          </Text>
        )}
      </KeyboardFormScroll>
    );
  }

  return (
    <SettingsForm testID="app-setup-list" header={header}>
      <SettingsSection title={copy.title} on={SHEET_GROUP}>
        {load === 'loading' ? <SettingsRow title={copy.loading} on={SHEET_GROUP} /> : null}
        {descriptors.map((descriptor) => (
          <SettingsRow
            key={descriptor.platform}
            title={copy.platform(descriptor.platform)}
            detail={copy.kind(descriptor.kind)}
            on={SHEET_GROUP}
            disclosure
            testID={`app-setup-${descriptor.platform}`}
            onPress={() => void run(() => port.start(descriptor.platform))}
          />
        ))}
        {load === 'ready' && descriptors.length === 0 ? (
          <SettingsRow title={copy.empty} on={SHEET_GROUP} />
        ) : null}
      </SettingsSection>
      {load === 'error' || message !== '' ? (
        <View style={{ gap: space.x2 }}>
          <Text accessibilityRole="alert" tone="danger">
            {message === '' ? copy.loadFailed : message}
          </Text>
          <Button label={copy.reload} testID="app-setup-retry" onPress={() => void reload()} />
        </View>
      ) : null}
    </SettingsForm>
  );
}
