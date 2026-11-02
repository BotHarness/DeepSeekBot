import { useSyncExternalStore } from 'react';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { fetch } from 'expo/fetch';
import { CloudClient } from './client';

const KEY = 'tob.cloud.v1';
const base64url = (value: string) =>
  value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
export const cloudClient = new CloudClient({
  read: () => SecureStore.getItemAsync(KEY),
  write: (value) =>
    SecureStore.setItemAsync(KEY, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
  random: () => base64url(btoa(String.fromCharCode(...Crypto.getRandomBytes(32)))),
  challenge: async (verifier) =>
    base64url(
      await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
        encoding: Crypto.CryptoEncoding.BASE64,
      }),
    ),
  digest: (value) =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, {
      encoding: Crypto.CryptoEncoding.HEX,
    }),
  now: () => Date.now(),
  request: async (url, init) => {
    return fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  },
  authorize: async (url, callback) => {
    const result = await WebBrowser.openAuthSessionAsync(url, callback, {
      preferEphemeralSession: true,
    });
    return result.type === 'success' ? result.url : null;
  },
});
const subscribe = (listener: () => void) => {
  const release = cloudClient.subscribe(listener);
  void cloudClient.load().catch(() => {});
  return release;
};
export function useCloudSnapshot() {
  return useSyncExternalStore(subscribe, cloudClient.getSnapshot, cloudClient.getSnapshot);
}

const JOIN_KEY = 'tob.cloud.pending-join.v1';
export const pendingCloudJoin = {
  read: () => SecureStore.getItemAsync(JOIN_KEY),
  save: (link: string) => SecureStore.setItemAsync(JOIN_KEY, link),
  clear: () => SecureStore.deleteItemAsync(JOIN_KEY),
};
