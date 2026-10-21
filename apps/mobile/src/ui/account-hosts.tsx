import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import type { ConnectAccount, ConnectHost, ConnectRefusal } from '../host/connect-account';
import { confirmDestructive } from './primitives/app-dialog';
import { Button } from './primitives/button';
import { Text } from './primitives/text';
import { space } from './design/tokens';
import { t } from './strings';

export function AccountHosts(props: {
  account: Pick<ConnectAccount, 'email' | 'signIn' | 'hosts' | 'signOut' | 'deleteAccount'>;
  busy: boolean;
  onPair(host: ConnectHost): void;
}) {
  const { account } = props;
  const [email, setEmail] = useState<string | undefined | null | false>(false);
  const [hosts, setHosts] = useState<ConnectHost[] | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ConnectRefusal | undefined>();

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(undefined);
    const listed = await account.hosts();
    setLoading(false);
    if (listed.ok) return setHosts(listed.value);
    setHosts(undefined);
    if (listed.code === 'sign-in-required') setEmail(null);
    setError(listed.code);
  };

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void account.email().then((current) => {
        if (!live) return;
        setEmail(current);
        if (current !== null) void load();
      });
      return () => {
        live = false;
      };
    }, [account]),
  );

  const signIn = async (): Promise<void> => {
    setLoading(true);
    setError(undefined);
    const result = await account.signIn();
    setLoading(false);
    if (!result.ok) return setError(result.code);
    setEmail(result.value);
    await load();
  };

  const signOut = async (): Promise<void> => {
    await account.signOut();
    setEmail(null);
    setHosts(undefined);
    setError(undefined);
  };

  const deleteAccount = async (): Promise<void> => {
    setLoading(true);
    setError(undefined);
    const result = await account.deleteAccount();
    setLoading(false);
    if (!result.ok) return setError(result.code);
    setEmail(null);
    setHosts(undefined);
  };

  if (email === false) return null;
  return (
    <View style={{ gap: space.x2 }} testID="account-hosts">
      <Text variant="meta" tone="muted" accessibilityRole="header">
        {t.pairAccount.title}
      </Text>
      <Text variant="meta" tone="muted">
        {typeof email === 'string' ? t.pairAccount.signedIn(email) : t.pairAccount.hint}
      </Text>
      {error !== undefined ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" tone="danger">
          {t.pairRefused[error]}
        </Text>
      ) : null}
      {email === null ? (
        <Button
          label={t.pairAccount.signIn}
          busy={loading}
          disabled={loading || props.busy}
          onPress={() => void signIn()}
        />
      ) : (
        <>
          {hosts?.length === 0 ? (
            <Text variant="meta" tone="muted">
              {t.pairAccount.empty}
            </Text>
          ) : null}
          {hosts?.map((host) => (
            <Button
              key={host.id}
              label={
                host.online
                  ? t.pairAccount.pairWith(host.name)
                  : `${t.pairAccount.pairWith(host.name)} · ${t.pairAccount.offline}`
              }
              disabled={props.busy || loading}
              onPress={() => props.onPair(host)}
            />
          ))}
          <View style={{ flexDirection: 'row', gap: space.x3, flexWrap: 'wrap' }}>
            <Button
              label={t.pairAccount.refresh}
              variant="text"
              busy={loading}
              disabled={loading || props.busy}
              onPress={() => void load()}
            />
            <Button
              label={t.pairAccount.signOut}
              variant="text"
              disabled={loading || props.busy}
              onPress={() => void signOut()}
            />
            <Button
              label={t.pairAccount.deleteAccount}
              variant="text"
              disabled={loading || props.busy}
              onPress={() =>
                confirmDestructive(
                  t.pairAccount.deleteTitle,
                  t.pairAccount.deleteMessage,
                  t.pairAccount.deleteConfirm,
                  deleteAccount,
                )
              }
            />
          </View>
        </>
      )}
    </View>
  );
}
