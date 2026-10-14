import { CameraView, useCameraPermissions } from 'expo-camera';
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { hostSession } from '../src/host/host-session';
import { nativeCarrier } from '../src/host/native-carrier';
import { parsePairingLink, redeemPairing, type PairingRefusal } from '../src/host/pairing';
import { t } from '../src/ui/strings';
import { useTheme } from '../src/ui/theme';

function deviceName(): string {
  return Constants.deviceName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android phone');
}

export default function PairScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ p?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PairingRefusal | undefined>();
  const handled = useRef<string | undefined>(undefined);

  const pair = async (text: string): Promise<void> => {
    if (busy || handled.current === text) return;
    handled.current = text;
    const parsed = parsePairingLink(text);
    if (!parsed.ok) return setError(parsed.code);
    setBusy(true);
    setError(undefined);
    const result = await redeemPairing({
      payload: parsed.payload,
      deviceName: deviceName(),
      carrier: nativeCarrier(),
    });
    setBusy(false);
    if (!result.ok) return setError(result.code);
    await hostSession.pair(result.host);
    router.replace('/');
  };

  if (typeof params.p === 'string' && handled.current === undefined)
    void pair(`deepseekbot://pair?p=${params.p}`);

  const button = {
    backgroundColor: theme.brand,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  } as const;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ color: theme.inkSoft, fontSize: 14 }}>{t.pairHint}</Text>
        <View
          style={{
            aspectRatio: 1,
            borderRadius: 16,
            overflow: 'hidden',
            backgroundColor: theme.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {permission?.granted ? (
            <CameraView
              style={{ width: '100%', height: '100%' }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={busy ? undefined : ({ data }) => void pair(data)}
            />
          ) : (
            <Pressable
              onPress={() => void requestPermission()}
              accessibilityRole="button"
              style={{ padding: 16 }}
            >
              <Text style={{ color: theme.accent, fontSize: 16, fontWeight: '600' }}>
                {t.allowCamera}
              </Text>
            </Pressable>
          )}
        </View>
        {busy ? <ActivityIndicator /> : null}
        {error !== undefined ? (
          <Text style={{ color: theme.danger }}>{t.pairRefused[error]}</Text>
        ) : null}
        <Text style={{ color: theme.ink, fontWeight: '600' }}>{t.pasteLink}</Text>
        <TextInput
          value={link}
          onChangeText={(value) => {
            setLink(value);
            handled.current = undefined;
          }}
          placeholder="deepseekbot://pair?p=…"
          placeholderTextColor={theme.inkSoft}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 12,
            padding: 12,
            fontSize: 16,
            color: theme.ink,
            backgroundColor: theme.surface,
          }}
        />
        <Pressable
          onPress={() => void pair(link)}
          disabled={busy || link.trim() === ''}
          accessibilityRole="button"
          style={button}
        >
          <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600' }}>{t.pair}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
