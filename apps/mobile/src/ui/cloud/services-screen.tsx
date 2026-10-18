import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Linking, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cloudError, configurationChanges, parseCloudQr } from '../../cloud/client';
import { connectionKey, type InstanceConfig } from '../../cloud/instance-contract';
import { cloudClient, useCloudSnapshot } from '../../cloud/native';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { ConnectionNameField } from '../primitives/connection-name-field';
import { Text } from '../primitives/text';
import { TextInput } from '../primitives/system-text';
import { t } from '../strings';

function errorMessage(code: string) {
  if (code === 'INSTANCE_CONFIG_CHANGED') return t.cloud.changed;
  if (code === 'ONBOARDING_INCOMPLETE') return t.cloud.onboardingIncomplete;
  if (code === 'INSTANCE_ACCESS_DENIED') return t.cloud.denied;
  if (code === 'LOGIN_CANCELLED') return t.cloud.cancelled;
  if (code === 'LOGIN_EXPIRED') return t.cloud.expired;
  if (code === 'LOGIN_REQUIRED') return t.cloud.required;
  if (code === 'STORAGE_UNAVAILABLE') return t.cloud.storage;
  if (code === 'INVALID_INSTANCE_CONFIG' || code === 'MOBILE_NOT_ENABLED') return t.cloud.invalid;
  return `${t.cloud.error} ${code}`;
}
export function CloudServicesScreen() {
  const snapshot = useCloudSnapshot();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const scanned = useRef(false);
  const [pasting, setPasting] = useState(false);
  const [configurationText, setConfigurationText] = useState('');
  const [candidate, setCandidate] = useState<{ raw: string; config: InstanceConfig }>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [connectionName, setConnectionName] = useState('');
  const [editingName, setEditingName] = useState<{ id: string; value: string }>();
  const old =
    candidate && snapshot.rows.find((row) => row.config.instanceId === candidate.config.instanceId);
  const replacement =
    !!old && !!candidate && connectionKey(old.config) !== connectionKey(candidate.config);
  const run = async (action: () => Promise<unknown>) => {
    setError(undefined);
    setNotice(undefined);
    try {
      await action();
    } catch (e) {
      setError(cloudError(e));
    }
  };
  const scan = (raw: string) => {
    if (scanned.current) return;
    scanned.current = true;
    setScanning(false);
    setCandidate(undefined);
    setNotice(undefined);
    setError(undefined);
    try {
      const config = parseCloudQr(raw);
      setCandidate({ raw, config });
      setConnectionName(
        snapshot.rows.find((row) => row.config.instanceId === config.instanceId)?.config.name ??
          config.name,
      );
      setPasting(false);
      setConfigurationText('');
      Keyboard.dismiss();
    } catch (e) {
      setError(cloudError(e));
    }
  };
  const box = {
    padding: space.x5,
    gap: space.x4,
    borderRadius: radius.lg,
    backgroundColor: theme.layer.raised.fill,
  };
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.color.base }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={{
        padding: space.x5,
        paddingBottom: insets.bottom + space.x6,
        gap: space.x5,
      }}
      data={snapshot.rows}
      keyExtractor={(row) => row.config.instanceId}
      ListHeaderComponent={
        <View style={{ gap: space.x4 }}>
          <Text>{t.cloud.hint}</Text>
          {!snapshot.ready && <Text>{snapshot.error ? t.cloud.blocked : t.cloud.loading}</Text>}
          {snapshot.busy && (
            <View accessibilityRole="progressbar" accessibilityLabel={t.cloud.working}>
              <ActivityIndicator />
              <Text>{t.cloud.working}</Text>
            </View>
          )}
          {!!(error || snapshot.error) && (
            <Text accessibilityLiveRegion="polite">{errorMessage(error || snapshot.error!)}</Text>
          )}
          {!!notice && <Text accessibilityLiveRegion="polite">{notice}</Text>}
          <Button
            label={t.cloud.scan}
            disabled={!snapshot.ready || snapshot.busy}
            onPress={() => {
              setCandidate(undefined);
              setError(undefined);
              scanned.current = false;
              setPasting(false);
              setScanning(true);
            }}
          />
          <Button
            label={t.cloud.paste}
            disabled={!snapshot.ready || snapshot.busy}
            onPress={() => {
              setCandidate(undefined);
              setError(undefined);
              setScanning(false);
              setPasting(true);
            }}
          />
          {pasting && (
            <View style={box}>
              <Text>{t.cloud.pasteHint}</Text>
              <TextInput
                value={configurationText}
                onChangeText={setConfigurationText}
                accessibilityLabel={t.cloud.configurationText}
                placeholder={t.cloud.configurationText}
                placeholderTextColor={theme.color.subtle}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                maxLength={4097}
                editable={!snapshot.busy}
                style={{
                  minHeight: theme.touch,
                  padding: space.x4,
                  borderRadius: radius.md,
                  backgroundColor: theme.color.base,
                  color: theme.color.fg,
                  fontSize: theme.type.body.size,
                }}
              />
              <Button
                label={t.cloud.reviewConfig}
                disabled={snapshot.busy || !configurationText.trim()}
                onPress={() => {
                  scanned.current = false;
                  scan(configurationText);
                }}
              />
              <Button
                label={t.cloud.cancel}
                onPress={() => {
                  setPasting(false);
                  setConfigurationText('');
                  Keyboard.dismiss();
                }}
              />
            </View>
          )}
          {scanning && (
            <View style={box}>
              {permission?.granted ? (
                focused && (
                  <CameraView
                    style={{ aspectRatio: 1 }}
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={({ data }) => scan(data)}
                  />
                )
              ) : (
                <>
                  <Text>{t.cloud.permission}</Text>
                  <Button
                    label={permission?.canAskAgain === false ? t.cloud.settings : t.cloud.camera}
                    onPress={() => {
                      void run(() =>
                        permission?.canAskAgain === false
                          ? Linking.openSettings()
                          : requestPermission(),
                      );
                    }}
                  />
                </>
              )}
              <Button label={t.cloud.cancel} onPress={() => setScanning(false)} />
            </View>
          )}
          {candidate && (
            <View style={box}>
              <ConnectionNameField
                value={connectionName}
                onChange={setConnectionName}
                maxLength={100}
                disabled={snapshot.busy}
              />
              <Text selectable>{candidate.config.server}</Text>
              <Text variant="meta" selectable>
                {candidate.config.instanceId} · {candidate.config.environment.toUpperCase()}
              </Text>
              <Text>{t.cloud.trust}</Text>
              {replacement && (
                <>
                  <Text>{t.cloud.replaceHint}</Text>
                  {configurationChanges(old.config, candidate.config).map((change) => (
                    <View key={change.field} style={{ gap: space.x2 }}>
                      <Text variant="meta">{change.field}</Text>
                      <Text selectable>
                        {change.previous} → {change.next}
                      </Text>
                    </View>
                  ))}
                </>
              )}
              <Button
                label={replacement ? t.cloud.replace : t.cloud.importConfig}
                disabled={snapshot.busy}
                onPress={() =>
                  void run(async () => {
                    await cloudClient.importConfig(
                      JSON.stringify({
                        ...candidate.config,
                        name: connectionName.trim() || candidate.config.name,
                      }),
                      replacement,
                    );
                    setCandidate(undefined);
                    setNotice(t.cloud.imported);
                  })
                }
              />
              <Button
                label={t.cloud.cancel}
                disabled={snapshot.busy}
                onPress={() => setCandidate(undefined)}
              />
            </View>
          )}
        </View>
      }
      ListEmptyComponent={snapshot.ready ? <Text>{t.cloud.empty}</Text> : <View />}
      renderItem={({ item }) => (
        <View style={box}>
          <Text variant="title">{item.config.name}</Text>
          <Text selectable>{item.config.server}</Text>
          {editingName?.id === item.config.instanceId ? (
            <View style={{ gap: space.x3 }}>
              <ConnectionNameField
                value={editingName.value}
                onChange={(value) => setEditingName({ id: item.config.instanceId, value })}
                maxLength={100}
                disabled={snapshot.busy}
              />
              <Button
                label={t.saveConnectionName}
                disabled={snapshot.busy || !editingName.value.trim()}
                onPress={() =>
                  void run(async () => {
                    await cloudClient.rename(item.config.instanceId, editingName.value);
                    setEditingName(undefined);
                    Keyboard.dismiss();
                  })
                }
              />
              <Button
                label={t.cancel}
                onPress={() => {
                  setEditingName(undefined);
                  Keyboard.dismiss();
                }}
              />
            </View>
          ) : (
            <Button
              label={t.renameConnection}
              disabled={snapshot.busy}
              onPress={() =>
                setEditingName({ id: item.config.instanceId, value: item.config.name })
              }
            />
          )}

          <Text variant="meta">{item.config.environment.toUpperCase()}</Text>
          <Text>
            {item.identity
              ? item.identity.instanceRole === 'admin'
                ? t.cloud.signedIn
                : t.cloud.signedInUser
              : item.hasSession
                ? t.cloud.savedSession
                : t.cloud.signedOut}
          </Text>
          {!!item.identity && (
            <Button
              label={t.cloudOrganizations.title}
              disabled={snapshot.busy}
              onPress={() =>
                router.push({
                  pathname: '/cloud-organizations',
                  params: { instanceId: item.config.instanceId },
                })
              }
            />
          )}
          {item.hasSession ? (
            <>
              <Button
                label={t.cloud.verify}
                disabled={snapshot.busy}
                onPress={() => void run(() => cloudClient.whoami(item.config.instanceId))}
              />
              <Button
                label={t.cloud.refresh}
                disabled={snapshot.busy}
                onPress={() => void run(() => cloudClient.refresh(item.config.instanceId))}
              />
              <Button
                label={t.cloud.logout}
                disabled={snapshot.busy}
                onPress={() =>
                  void run(async () => {
                    const result = await cloudClient.logout(item.config.instanceId);
                    setNotice(result.remoteRevoked ? t.cloud.loggedOut : t.cloud.localOnly);
                  })
                }
              />
            </>
          ) : (
            <Button
              label={t.cloud.login}
              disabled={snapshot.busy}
              onPress={() => void run(() => cloudClient.login(item.config.instanceId))}
            />
          )}
        </View>
      )}
    />
  );
}
