import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { fetch } from 'expo/fetch';
import { router } from 'expo-router';

import { MOBILE_REDIRECT_URI } from '../cloud/instance-contract';
import { hostSession } from './host-session';
import { createConnectAccount } from './connect-account';
import { startEmailCodeSignIn } from './email-code-bridge';

const KEY = 'botharness.connect-account.v1';
const base64url = (value: string) =>
  value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const devRelay = __DEV__ ? process.env.EXPO_PUBLIC_CONNECT_RELAY : undefined;

export const connectAccount = createConnectAccount({
  ...(devRelay ? { relay: devRelay } : {}),
  removeConnections: (owner) => hostSession.removeAccount(owner),
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
    authorize: async (url, callback) => {
      const result = await WebBrowser.openAuthSessionAsync(url, callback, {
        preferEphemeralSession: true,
      });
      return result.type === 'success' ? result.url : null;
    },
    collectEmailCode: (flow) => startEmailCodeSignIn(flow, () => router.push('/sign-in')),
  },
});
