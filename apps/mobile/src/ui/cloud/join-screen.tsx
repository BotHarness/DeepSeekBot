import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { cloudError } from '../../cloud/client';
import type { InstanceConfig } from '../../cloud/instance-contract';
import type { Invitation } from '../../cloud/invitation-contract';
import { parseInvitationLink } from '../../cloud/invitation-link';
import { cloudClient, pendingCloudJoin, useCloudSnapshot } from '../../cloud/native';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { TextField } from '../primitives/text-field';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { CloudChannelName } from './channel-name';

export function CloudJoinScreen() {
  const params = useLocalSearchParams<{ link?: string }>();
  const snapshot = useCloudSnapshot(),
    theme = useDesignTheme();
  const [link, setLink] = useState('');
  const [candidate, setCandidate] = useState<InstanceConfig>();
  const [invitation, setInvitation] = useState<Invitation>();
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);
  const running = useRef(false);
  const [scanning, setScanning] = useState(false),
    [focused, setFocused] = useState(false);
  const restored = useRef<string | undefined>(undefined);
  const [permission, requestPermission] = useCameraPermissions();
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const raw = params.link ?? (await pendingCloudJoin.read());
        if (raw && active && raw !== restored.current) {
          restored.current = raw;
          parseInvitationLink(raw);
          setLink(raw);
          setInvitation(undefined);
          setCandidate(undefined);
        }
      })().catch((e) => {
        if (active) setError(cloudError(e));
      });
      return () => {
        active = false;
      };
    }, [params.link]),
  );
  let target: ReturnType<typeof parseInvitationLink> | undefined;
  try {
    target = parseInvitationLink(link);
  } catch {}
  const row = snapshot.rows.find((r) => r.config.server === target?.server);
  const config = row?.config ?? candidate;
  const busy = working || snapshot.busy || !snapshot.ready;
  const run = async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setWorking(true);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(cloudError(e));
    } finally {
      running.current = false;
      setWorking(false);
    }
  };
  const review = async () => {
    parseInvitationLink(link);
    await pendingCloudJoin.save(link);
    if (row?.hasSession)
      setInvitation(await cloudClient.previewInvitation(row.config.instanceId, link));
    else setCandidate(await cloudClient.inspectInvitationService(link));
  };
  const box = {
    padding: space.x5,
    gap: space.x4,
    borderRadius: radius.lg,
    backgroundColor: theme.layer.raised.fill,
  };
  return (
    <KeyboardFormScroll
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: theme.color.base }}
      contentContainerStyle={{ padding: space.x5, gap: space.x5 }}
    >
      <Stack.Screen options={{ title: t.cloudJoin.title }} />
      <Text>{t.cloudJoin.neutral}</Text>
      <TextField
        accessibilityLabel={t.cloudJoin.link}
        placeholder={t.cloudJoin.link}
        value={link}
        onChangeText={(value) => {
          setLink(value);
          setCandidate(undefined);
          setInvitation(undefined);
          setError(undefined);
        }}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={2048}
        editable={!busy}
      />
      <Button label={t.cloudJoin.scan} disabled={busy} onPress={() => setScanning(true)} />
      {scanning &&
        focused &&
        (permission?.granted ? (
          <CameraView
            style={{ aspectRatio: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              setScanning(false);
              setLink(data);
              setCandidate(undefined);
              setInvitation(undefined);
            }}
          />
        ) : (
          <Button label={t.cloud.scan} onPress={() => void requestPermission()} />
        ))}
      <Button
        label={t.cloudJoin.review}
        disabled={busy || !link.trim()}
        onPress={() => void run(review)}
      />
      {!!target && (
        <View style={box}>
          <Text>{t.cloudJoin.service}</Text>
          <Text selectable>{target.server}</Text>
          <Text>{t.cloudJoin.trustHint}</Text>
        </View>
      )}
      {!!candidate && !row && (
        <View style={box}>
          <Text variant="title">{candidate.name}</Text>
          <Text selectable>{candidate.server}</Text>
          <Text selectable>{candidate.auth.authkitDomain}</Text>
          <Button
            label={t.cloudJoin.trust}
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await cloudClient.importConfig(JSON.stringify(candidate));
              })
            }
          />
        </View>
      )}
      {!!row && !row.hasSession && (
        <Button
          label={t.cloudJoin.signIn}
          disabled={busy}
          onPress={() =>
            void run(async () => {
              await pendingCloudJoin.save(link);
              await cloudClient.login(row.config.instanceId);
              setInvitation(await cloudClient.previewInvitation(row.config.instanceId, link));
            })
          }
        />
      )}
      {!!row?.hasSession && (
        <View style={box}>
          <Text>{t.cloudJoin.account}</Text>
          <Text selectable>
            {invitation?.email ?? row.identity?.userId ?? t.cloud.savedSession}
          </Text>
          <Button
            label={t.cloudJoin.switchAccount}
            disabled={busy}
            onPress={() =>
              void run(async () => {
                setInvitation(undefined);
                await cloudClient.logout(row.config.instanceId);
              })
            }
          />
        </View>
      )}
      {!!invitation && !!config && (
        <View style={box}>
          <Text variant="title">{invitation.organizationName ?? invitation.organizationId}</Text>
          {!!invitation.channelName && <CloudChannelName name={invitation.channelName} />}
          <Text>
            {invitation.role === 'guest' ? t.cloudJoin.channelScope : t.cloudJoin.orgScope}
          </Text>
          <Text selectable>{invitation.email}</Text>
          <Text>{t.cloudInvitations.states[invitation.state]}</Text>
          <Text>
            {t.cloudInvitations.expires} {invitation.expiresAt}
          </Text>
          {(invitation.state === 'pending' || invitation.state === 'accepted') && (
            <Button
              label={invitation.state === 'accepted' ? t.cloudJoin.open : t.cloudJoin.join}
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  const accepted = await cloudClient.acceptInvitation(
                    config.instanceId,
                    invitation.invitationId,
                    invitation.role === 'guest',
                  );
                  if (accepted.role !== 'guest')
                    await cloudClient.useOrganization(config.instanceId, accepted.organizationId);
                  await pendingCloudJoin.clear();
                  router.replace({
                    pathname: '/cloud-channels',
                    params: {
                      instanceId: config.instanceId,
                      organizationId: accepted.organizationId,
                      ...(accepted.channelId
                        ? { channelId: accepted.channelId, guest: 'true' }
                        : {}),
                    },
                  });
                })
              }
            />
          )}
        </View>
      )}
      {!!error && (
        <View accessibilityLiveRegion="polite">
          <Text selectable>{t.cloudJoin.unavailable}</Text>
          <Text selectable>{error}</Text>
        </View>
      )}
      {busy && <Text accessibilityRole="progressbar">{t.cloud.working}</Text>}
      <Button
        label={t.cloudJoin.cancel}
        disabled={busy}
        onPress={() =>
          void run(async () => {
            await pendingCloudJoin.clear();
            setLink('');
            setCandidate(undefined);
            setInvitation(undefined);
          })
        }
      />
      <Button label={t.cloudJoin.computer} disabled={busy} onPress={() => router.push('/pair')} />
      <Button
        label={t.cloudJoin.connect}
        disabled={busy}
        onPress={() => router.push('/cloud-services')}
      />
    </KeyboardFormScroll>
  );
}
