import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { fetch } from 'expo/fetch';
import { router } from 'expo-router';

import { AppState } from 'react-native';
import { isConnectRoute } from './route';
import { MOBILE_REDIRECT_URI } from '../cloud/instance-contract';
import { hostSession } from './host-session';
import { authorizeWithLateRedirect, createConnectAccount } from './connect-account';
import { startEmailCodeSignIn } from './email-code-bridge';

const KEY = 'botharness.connect-account.v1';
const base64url = (value: string) =>
  value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const devRelay = __DEV__ ? process.env.EXPO_PUBLIC_CONNECT_RELAY : undefined;

export const connectAccount = createConnectAccount({
  ...(devRelay ? { relay: devRelay } : {}),
  removeConnections: (owner) => hostSession.removeAccount(owner),
  listedHosts: (hosts) => hostSession.followConnectHosts(hosts),
  redirectUri: Application.applicationId
    ? `${Application.applicationId}:/oauth2redirect`
    : MOBILE_REDIRECT_URI,
  runtime: {
    read: () => SecureStore.getItemAsync(KEY),
    write: (value) =>
      value === null
        ? SecureStore.deleteItemAsync(KEY)
        : SecureStore.setItemAsync(KEY, value, {
            keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
          }),
    random: () => base64url(btoa(String.fromCharCode(...Crypto.getRandomBytes(32)))),
    challenge: async (verifier) =>
      base64url(
        await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
          encoding: Crypto.CryptoEncoding.BASE64,
        }),
      ),
    now: () => Date.now(),
    request: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) }),
    authorize: (url, callback) => {
      let ended: string | undefined;
      return authorizeWithLateRedirect(
        url,
        callback,
        async (authUrl, returnUrl) => {
          const result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl, {
            preferEphemeralSession: true,
          });
          if (result.type !== 'success') ended = result.type;
          return result.type === 'success' ? result : { type: result.type };
        },
        (_prefix, onRedirect) => Linking.addEventListener('url', (event) => onRedirect(event.url)),
        1500,
        (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      ).then((redirect) => {
        if (redirect === null)
          console.warn(`[connect] auth session ended without a redirect: ${ended ?? 'unknown'}`);
        return redirect;
      });
    },
    collectEmailCode: (flow) => startEmailCodeSignIn(flow, () => router.push('/sign-in')),
  },
});

AppState.addEventListener('change', (next) => {
  if (next !== 'active') return;
  if (
    !hostSession
      .getState()
      .hosts.some((host) => host.accountOwner && host.routes.some(isConnectRoute))
  )
    return;
  void connectAccount.hosts();
});
