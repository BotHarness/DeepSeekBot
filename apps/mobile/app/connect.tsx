import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { hostSession, useHostSession } from '../src/host/host-session';
import { checkRoute } from '../src/host/route';
import { t } from '../src/ui/strings';
import { useTheme } from '../src/ui/theme';

export default function ConnectScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { saved } = useHostSession();
  const [route, setRoute] = useState(saved?.route ?? '');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | undefined>();

  const submit = async () => {
    const checked = checkRoute(route);
    if (!checked.ok) return setError(checked.reason);
    if (token.trim() === '') return setError(t.launchToken);
    setError(undefined);
    await hostSession.pair({ route: checked.origin, token: token.trim() });
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const input = {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: theme.ink,
    backgroundColor: theme.surface,
  } as const;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <View style={{ padding: 16, gap: 12 }}>
        <Text style={{ color: theme.inkSoft, fontSize: 14 }}>{t.connectHint}</Text>
        <Text style={{ color: theme.ink, fontWeight: '600' }}>{t.hostAddress}</Text>
        <TextInput
          value={route}
          onChangeText={setRoute}
          placeholder="https://my-mac.tailnet.ts.net"
          placeholderTextColor={theme.inkSoft}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={input}
        />
        <Text style={{ color: theme.ink, fontWeight: '600' }}>{t.launchToken}</Text>
        <TextInput
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          textContentType="password"
          style={input}
        />
        {error !== undefined ? <Text style={{ color: theme.danger }}>{error}</Text> : null}
        <Pressable
          onPress={submit}
          accessibilityRole="button"
          style={{
            backgroundColor: theme.brand,
            borderRadius: 12,
            padding: 14,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600' }}>{t.connect}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
