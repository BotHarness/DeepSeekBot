import Constants from 'expo-constants';
import { useNavigationContainerRef, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

import type { AccountOwner } from '../../host/account-owner';
import { hostSession } from '../../host/host-session';
import { nativeCarrier } from '../../host/native-carrier';
import { connectAccount } from '../../host/native-connect-account';
import { hostLooks } from '../../host/native-host-look';
import { conversationFilter } from '../../host/native-conversation-filter';
import { computerEnvironmentKey } from '../../host/conversation-environments';
import { pairHost, type PairingFailure } from '../../host/pairing';
import { mobileTelemetry } from '../../telemetry/native';
import type { PairingMethod } from '../../telemetry/schema';
import { hostLookName } from '../design/host-look';
import { clearsPastedLink } from '../pairing-failure';
import { resetWorkspaceRoot } from './workspace-navigation';

function deviceName(): string {
  return Constants.deviceName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android phone');
}

export function usePairing(options: { stayOnPage?: boolean; preventDuplicates?: boolean } = {}) {
  const router = useRouter();
  const navigation = useNavigationContainerRef();
  const setupHost = useRef<string | undefined>(undefined);
  const finishSetup = () => {
    const hostId = setupHost.current;
    if (!hostId) return false;
    conversationFilter.set(computerEnvironmentKey(hostId));
    if (!resetWorkspaceRoot(navigation, undefined, hostId)) return false;
    setupHost.current = undefined;
    return true;
  };
  const [connectionName, setConnectionName] = useState('');
  const [busy, setBusy] = useState(false);
  const [fingerprint, setFingerprint] = useState<string>();
  const [computerName, setComputerName] = useState('');
  const [verification, setVerification] = useState<{
    fingerprint: string;
    confirm(matches: boolean): void;
  }>();
  const [error, setError] = useState<PairingFailure | undefined>();
  const lastMethod = useRef<PairingMethod>('paste');
  const pending = useRef<AbortController | undefined>(undefined);
  const handled = useRef<string | undefined>(undefined);
  const accountHostId = useRef<string | undefined>(undefined);

  const pair = async (
    text: string,
    method: PairingMethod,
    retry = false,
    hostId?: string,
  ): Promise<PairingFailure | undefined> => {
    if (pending.current !== undefined || (!retry && method === 'qr' && handled.current === text))
      return undefined;
    handled.current = text;
    accountHostId.current = hostId;
    lastMethod.current = method;
    const operation = new AbortController();
    pending.current = operation;
    Keyboard.dismiss();
    setComputerName('');
    setBusy(true);
    setError(undefined);
    let accountPair: { accountOwner: AccountOwner; sessionKey: string } | undefined;
    const startingHosts = hostSession.getState().hosts;
    const result = await pairHost({
      existing: (id) => startingHosts.find((host) => host.hostId === id),
      text:
        hostId === undefined
          ? text
          : async () => {
              const offer = await connectAccount.offer(hostId, deviceName());
              if (!offer.ok) return offer;
              accountPair = offer.value;
              return { ok: true, payload: offer.value };
            },
      method,
      deviceName: deviceName(),
      carrier: nativeCarrier(),
      confirmFingerprint: (fingerprint, hostName) =>
        new Promise<boolean>((resolve) => {
          if (operation.signal.aborted) {
            resolve(false);
            return;
          }
          let settled = false;
          const confirm = (matches: boolean) => {
            if (settled) return;
            settled = true;
            operation.signal.removeEventListener('abort', abort);
            setVerification(undefined);
            resolve(matches && !operation.signal.aborted);
          };
          const abort = () => confirm(false);
          operation.signal.addEventListener('abort', abort, { once: true });
          setComputerName(hostName);
          setVerification({ fingerprint, confirm });
        }),
      onPending: setFingerprint,
      save: async (host) => {
        const original = startingHosts.find((saved) => saved.hostId === host.hostId);
        if (original && original.credential !== host.credential) {
          await hostSession.replaceApprovedPairing(host, original.credential);
          return;
        }
        const existing = hostSession.getState().hosts.find((saved) => saved.hostId === host.hostId);
        if (existing?.credential === host.credential) {
          await hostSession.updateRoutes(host.hostId, host.credential, host.routes);
          return;
        }
        if (
          options.preventDuplicates &&
          hostSession
            .getState()
            .hosts.some(
              (saved) => saved.hostId === host.hostId && saved.credential !== host.credential,
            )
        )
          throw new Error('already-paired');
        if (accountPair) {
          const { accountOwner, sessionKey } = accountPair;
          await connectAccount.savePairing(sessionKey, () =>
            hostSession.pair({ ...host, accountOwner }),
          );
        } else await hostSession.pair(host);
        const name = hostLookName(connectionName);
        await hostLooks.initialize(
          host.hostId,
          hostSession.getState().hosts.map((saved) => saved.hostId),
          name,
        );
        if (!original) setupHost.current = host.hostId;
      },
      telemetry: mobileTelemetry,
      signal: operation.signal,
    });
    pending.current = undefined;
    setBusy(false);
    setFingerprint(undefined);
    if (operation.signal.aborted) return 'cancelled';
    if (!result.ok) {
      if (clearsPastedLink(result.code, method)) handled.current = undefined;
      setError(result.code);
      return result.code;
    }
    if (!options.stayOnPage && !finishSetup()) router.dismissTo('/');
    return undefined;
  };

  return {
    finishSetup,
    busy,
    fingerprint,
    verification,
    computerName,
    error,
    method: lastMethod.current,
    connectionName,
    setConnectionName,
    pair,
    canRetry: error !== undefined && handled.current !== undefined,
    retry: () => pair(handled.current!, lastMethod.current, true, accountHostId.current),
    forget: () => {
      handled.current = undefined;
    },
    abort: () => pending.current?.abort(),
  };
}
